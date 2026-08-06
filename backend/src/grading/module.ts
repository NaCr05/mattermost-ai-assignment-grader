import { logError, logInfo, logWarn } from "../logger";
import { prisma as defaultPrisma } from "../prisma";
import type { EvaluationAgent } from "./agent-port";
import { toEvaluationDto } from "./dto";
import { createHttpEvaluationAgent } from "./http-agent-adapter";

type GradingDatabase = typeof defaultPrisma;
type EvaluationAuditAction = "generated" | "regraded";

export type EvaluationChanges = {
  score?: number;
  grade?: "A" | "B" | "C" | "D" | "F";
  completenessComment?: string;
  correctnessComment?: string;
  mainProblems?: string[];
  suggestions?: string[];
};

export type ReviewEvaluationCommand =
  | {
      kind: "confirm";
      evaluationId: string;
      actorId: string;
      expectedVersion?: number;
    }
  | {
      kind: "modify";
      evaluationId: string;
      actorId: string;
      expectedVersion?: number;
      changes: EvaluationChanges;
    }
  | {
      kind: "regrade";
      evaluationId: string;
      actorId: string;
      expectedVersion?: number;
    };

const editableEvaluationStatuses = [
  "generated",
  "confirmed",
  "modified",
  "failed",
] as const;
const confirmableEvaluationStatuses = ["generated", "modified", "failed"] as const;

export class GradingError extends Error {
  constructor(
    readonly code: "forbidden" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "GradingError";
  }
}

type GradingModuleDependencies = {
  database?: GradingDatabase;
  evaluationAgent?: EvaluationAgent;
};

function safeFailureMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Evaluation Agent request timed out.";
  }
  return "Evaluation Agent request failed.";
}

export function createGradingModule(
  dependencies: GradingModuleDependencies = {},
) {
  const database = dependencies.database ?? defaultPrisma;
  const evaluationAgent =
    dependencies.evaluationAgent ?? createHttpEvaluationAgent();

  async function findTeacher(actorId: string) {
    return database.user.findFirst({
      where: { id: actorId, role: "teacher", disabledAt: null },
      select: { id: true, username: true, displayName: true },
    });
  }

  async function evaluateSubmission(command: {
    submissionId: string;
    auditAction?: EvaluationAuditAction;
    actorId?: string | null;
  }) {
    const auditAction = command.auditAction ?? "generated";
    const actorId = command.actorId ?? null;
    const startedAt = performance.now();

    logInfo("evaluation.started", {
      submissionId: command.submissionId,
      auditAction,
      actorId,
    });

    const submission = await database.submission.findUnique({
      where: { id: command.submissionId },
      include: {
        assignment: true,
        student: {
          select: { username: true, displayName: true },
        },
      },
    });

    if (!submission) {
      logWarn("evaluation.submission_not_found", {
        submissionId: command.submissionId,
        auditAction,
        actorId,
      });
      return null;
    }

    if (auditAction === "generated") {
      const claimed = await database.submission.updateMany({
        where: {
          id: command.submissionId,
          status: { in: ["submitted", "failed"] },
        },
        data: { status: "evaluating" },
      });
      if (claimed.count === 0) {
        throw new GradingError(
          "conflict",
          "Submission is already being evaluated or has an evaluation.",
        );
      }
    } else {
      await database.submission.update({
        where: { id: command.submissionId },
        data: { status: "evaluating" },
      });
    }

    try {
      const agentResult = await evaluationAgent.evaluate({
        assignment: {
          title: submission.assignment.title,
          question: submission.assignment.question,
          instructions: submission.assignment.instructions,
        },
        submission: {
          student: submission.student.displayName,
          answer: submission.answer,
        },
        rubric: submission.assignment.instructions,
      });
      const observability = agentResult.observability;
      const agentMetadata = {
        agentProvider: agentResult.provider,
        agentRequestId: observability?.requestId ?? null,
        agentAttempts: agentResult.attempts,
        modelName: observability?.modelName ?? null,
        promptVersion: observability?.promptVersion ?? null,
        agentDurationMs: observability?.durationMs ?? null,
        inputTokens: observability?.usage.inputTokens ?? null,
        outputTokens: observability?.usage.outputTokens ?? null,
        totalTokens: observability?.usage.totalTokens ?? null,
        estimatedCostUsd: observability?.usage.estimatedCostUsd ?? null,
      };

      const evaluation = await database.$transaction(async (transaction) => {
        const savedEvaluation = await transaction.evaluation.upsert({
          where: { submissionId: command.submissionId },
          update: {
            completenessLevel: agentResult.completeness.level,
            completenessComment: agentResult.completeness.comment,
            correctnessLevel: agentResult.correctness.level,
            correctnessComment: agentResult.correctness.comment,
            mainProblems: agentResult.main_problems,
            suggestions: agentResult.suggestions,
            score: agentResult.score,
            grade: agentResult.grade,
            status: "generated",
            agentRawOutput: agentResult.raw_output,
            errorMessage: null,
            ...agentMetadata,
            version: { increment: 1 },
            reviewedById: null,
            reviewedAt: null,
          },
          create: {
            submissionId: command.submissionId,
            completenessLevel: agentResult.completeness.level,
            completenessComment: agentResult.completeness.comment,
            correctnessLevel: agentResult.correctness.level,
            correctnessComment: agentResult.correctness.comment,
            mainProblems: agentResult.main_problems,
            suggestions: agentResult.suggestions,
            score: agentResult.score,
            grade: agentResult.grade,
            status: "generated",
            agentRawOutput: agentResult.raw_output,
            ...agentMetadata,
          },
        });

        await transaction.submission.update({
          where: { id: command.submissionId },
          data: { status: "evaluated" },
        });

        await transaction.evaluationAudit.create({
          data: {
            evaluationId: savedEvaluation.id,
            submissionId: command.submissionId,
            action: auditAction,
            version: savedEvaluation.version,
            snapshot: JSON.parse(
              JSON.stringify({
                evaluation: toEvaluationDto(savedEvaluation),
                agent: {
                  provider: agentResult.provider,
                  attempts: agentResult.attempts,
                },
              }),
            ),
            actorId,
            agentRawOutput: agentResult.raw_output,
          },
        });

        return savedEvaluation;
      });

      logInfo("evaluation.completed", {
        submissionId: command.submissionId,
        evaluationId: evaluation.id,
        auditAction,
        actorId,
        provider: agentResult.provider,
        attempts: agentResult.attempts,
        agentRequestId: agentResult.observability?.requestId,
        model: agentResult.observability?.modelName,
        promptVersion: agentResult.observability?.promptVersion,
        agentDurationMs: agentResult.observability?.durationMs,
        inputTokens: agentResult.observability?.usage.inputTokens,
        outputTokens: agentResult.observability?.usage.outputTokens,
        estimatedCostUsd: agentResult.observability?.usage.estimatedCostUsd,
        score: evaluation.score,
        grade: evaluation.grade,
        version: evaluation.version,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
      });

      return {
        evaluation,
        agent: {
          provider: agentResult.provider,
          attempts: agentResult.attempts,
        },
      };
    } catch (error) {
      await database.$transaction(async (transaction) => {
        await transaction.submission.update({
          where: { id: command.submissionId },
          data: { status: "failed" },
        });

        if (auditAction === "regraded") {
          await transaction.evaluation.updateMany({
            where: {
              submissionId: command.submissionId,
              status: "regrading",
            },
            data: {
              status: "failed",
              errorMessage: safeFailureMessage(error),
              version: { increment: 1 },
            },
          });
        }
      });

      logError("evaluation.failed", error, {
        submissionId: command.submissionId,
        auditAction,
        actorId,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
      });
      throw error;
    }
  }

  async function reviewEvaluation(command: ReviewEvaluationCommand) {
    const teacher = await findTeacher(command.actorId);
    if (!teacher) {
      throw new GradingError(
        "forbidden",
        "Only a teacher can review an evaluation.",
      );
    }

    const evaluation = await database.evaluation.findUnique({
      where: { id: command.evaluationId },
      include: {
        submission: {
          select: {
            assignment: { select: { createdById: true } },
          },
        },
      },
    });

    if (!evaluation) {
      return null;
    }

    if (evaluation.submission.assignment.createdById !== teacher.id) {
      throw new GradingError(
        "forbidden",
        "Teacher cannot review another teacher's assignment.",
      );
    }

    const expectedVersion = command.expectedVersion ?? evaluation.version;

    if (command.kind === "regrade") {
      const claimed = await database.evaluation.updateMany({
        where: {
          id: evaluation.id,
          version: expectedVersion,
          status: { in: [...editableEvaluationStatuses] },
        },
        data: {
          status: "regrading",
          reviewedById: teacher.id,
          reviewedAt: new Date(),
          errorMessage: null,
        },
      });
      if (claimed.count === 0) {
        throw new GradingError(
          "conflict",
          "Evaluation was updated by another reviewer or is already being regraded.",
        );
      }

      return evaluateSubmission({
        submissionId: evaluation.submissionId,
        auditAction: "regraded",
        actorId: teacher.id,
      });
    }

    return database.$transaction(async (transaction) => {
      if (command.kind === "confirm") {
        if (evaluation.status === "confirmed") {
          if (expectedVersion !== evaluation.version) {
            throw new GradingError(
              "conflict",
              "Evaluation was updated by another reviewer.",
            );
          }
          const savedEvaluation = await transaction.evaluation.findFirst({
            where: {
              id: evaluation.id,
              version: expectedVersion,
              status: "confirmed",
            },
            include: {
              reviewedBy: {
                select: { id: true, username: true, displayName: true },
              },
            },
          });
          if (!savedEvaluation) {
            throw new GradingError(
              "conflict",
              "Evaluation was updated by another reviewer.",
            );
          }
          return { evaluation: savedEvaluation, agent: undefined };
        }

        const updated = await transaction.evaluation.updateMany({
          where: {
            id: evaluation.id,
            version: expectedVersion,
            status: { in: [...confirmableEvaluationStatuses] },
          },
          data: {
            status: "confirmed",
            version: { increment: 1 },
            reviewedById: teacher.id,
            reviewedAt: new Date(),
            errorMessage: null,
          },
        });
        if (updated.count === 0) {
          throw new GradingError(
            "conflict",
            "Evaluation was updated by another reviewer or cannot be confirmed in its current state.",
          );
        }

        const savedEvaluation = await transaction.evaluation.findUniqueOrThrow({
          where: { id: evaluation.id },
          include: {
            reviewedBy: {
              select: { id: true, username: true, displayName: true },
            },
          },
        });

        await transaction.submission.update({
          where: { id: savedEvaluation.submissionId },
          data: { status: "evaluated" },
        });

        await transaction.evaluationAudit.create({
          data: {
            evaluationId: savedEvaluation.id,
            submissionId: savedEvaluation.submissionId,
            action: "confirmed",
            version: savedEvaluation.version,
            snapshot: JSON.parse(JSON.stringify(toEvaluationDto(savedEvaluation))),
            actorId: teacher.id,
            agentRawOutput: savedEvaluation.agentRawOutput,
          },
        });

        return { evaluation: savedEvaluation, agent: undefined };
      }

      const data = {
        ...(command.changes.score !== undefined
          ? { score: command.changes.score }
          : {}),
        ...(command.changes.grade !== undefined
          ? { grade: command.changes.grade }
          : {}),
        ...(command.changes.completenessComment !== undefined
          ? { completenessComment: command.changes.completenessComment.trim() }
          : {}),
        ...(command.changes.correctnessComment !== undefined
          ? { correctnessComment: command.changes.correctnessComment.trim() }
          : {}),
        ...(command.changes.mainProblems !== undefined
          ? { mainProblems: command.changes.mainProblems }
          : {}),
        ...(command.changes.suggestions !== undefined
          ? { suggestions: command.changes.suggestions }
          : {}),
        status: "modified" as const,
        version: { increment: 1 },
        reviewedById: teacher.id,
        reviewedAt: new Date(),
        errorMessage: null,
      };

      const updated = await transaction.evaluation.updateMany({
        where: {
          id: evaluation.id,
          version: expectedVersion,
          status: { in: [...editableEvaluationStatuses] },
        },
        data,
      });

      if (updated.count === 0) {
        throw new GradingError(
          "conflict",
          "Evaluation was updated by another reviewer or is being regraded.",
        );
      }

      const savedEvaluation = await transaction.evaluation.findUniqueOrThrow({
        where: { id: evaluation.id },
        include: {
          reviewedBy: {
            select: { id: true, username: true, displayName: true },
          },
        },
      });

      await transaction.submission.update({
        where: { id: savedEvaluation.submissionId },
        data: { status: "evaluated" },
      });

      await transaction.evaluationAudit.create({
        data: {
          evaluationId: savedEvaluation.id,
          submissionId: savedEvaluation.submissionId,
          action: "modified",
          version: savedEvaluation.version,
          snapshot: JSON.parse(JSON.stringify(toEvaluationDto(savedEvaluation))),
          actorId: teacher.id,
          agentRawOutput: savedEvaluation.agentRawOutput,
        },
      });

      return { evaluation: savedEvaluation, agent: undefined };
    });
  }

  return {
    evaluateSubmission,
    reviewEvaluation,
  };
}

export const gradingModule = createGradingModule();
