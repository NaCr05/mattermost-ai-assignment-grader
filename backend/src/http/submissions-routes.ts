import express from "express";
import type { CurrentUser } from "../auth/http-adapter";
import type { createGradingModule } from "../grading/module";
import { toEvaluationAuditDto, toEvaluationDto, toSubmissionDto } from "../grading/dto";
import { logError } from "../logger";
import type { prisma as defaultPrisma } from "../prisma";
import { isNonEmptyString, sendGradingError, sendServerError } from "./error-mapping";

type Database = typeof defaultPrisma;
type GradingModule = ReturnType<typeof createGradingModule>;

export function createSubmissionsRouter(input: {
  database: Database;
  grading: GradingModule;
  currentUser(response: express.Response): CurrentUser | undefined;
}) {
  const router = express.Router();

  async function findAccessibleSubmission(id: string, user: CurrentUser) {
    const submission = await input.database.submission.findUnique({
      where: { id },
      include: {
        assignment: true,
        student: { select: { id: true, username: true, displayName: true, role: true } },
        evaluation: true,
      },
    });
    if (!submission) return { kind: "missing" as const };
    const permitted = user.role === "student"
      ? submission.studentId === user.id
      : submission.assignment.createdById === user.id;
    return permitted
      ? { kind: "allowed" as const, submission }
      : { kind: "forbidden" as const };
  }

  router.post("/assignments/:id/submissions", async (request, response) => {
    try {
      const user = input.currentUser(response)!;
      if (user.role !== "student") {
        return response.status(403).json({ message: "Only a student can submit an answer" });
      }
      const { answer } = request.body;
      if (!isNonEmptyString(answer)) {
        return response.status(400).json({ message: "answer is required" });
      }
      const assignmentId = request.params.id;
      const assignment = await input.database.assignment.findUnique({ where: { id: assignmentId } });
      if (!assignment) return response.status(404).json({ message: "Assignment not found" });
      if (assignment.status !== "published") {
        return response.status(409).json({ message: "Assignment is closed" });
      }
      const existing = await input.database.submission.findUnique({
        where: { assignmentId_studentId: { assignmentId, studentId: user.id } },
      });
      const submission = await input.database.$transaction(async (transaction) => {
        if (existing) {
          await transaction.evaluation.deleteMany({ where: { submissionId: existing.id } });
          return transaction.submission.update({
            where: { id: existing.id },
            data: { answer: answer.trim(), status: "submitted", submittedAt: new Date() },
            include: {
              student: { select: { id: true, username: true, displayName: true, role: true } },
              evaluation: true,
            },
          });
        }
        return transaction.submission.create({
          data: { assignmentId, studentId: user.id, answer: answer.trim() },
          include: {
            student: { select: { id: true, username: true, displayName: true, role: true } },
            evaluation: true,
          },
        });
      });
      response.status(existing ? 200 : 201).json(submission);
    } catch (error) {
      sendServerError(response, "Failed to submit answer", error);
    }
  });

  router.get("/assignments/:id/submissions", async (request, response) => {
    try {
      const user = input.currentUser(response)!;
      if (user.role !== "teacher") {
        return response.status(403).json({ message: "Teacher role required" });
      }
      const assignment = await input.database.assignment.findUnique({
        where: { id: request.params.id },
        select: { id: true, title: true, createdById: true },
      });
      if (!assignment) return response.status(404).json({ message: "Assignment not found" });
      if (assignment.createdById !== user.id) {
        return response.status(403).json({ message: "Assignment access denied" });
      }
      const submissions = await input.database.submission.findMany({
        where: { assignmentId: request.params.id },
        include: {
          student: { select: { id: true, username: true, displayName: true, role: true } },
          evaluation: true,
        },
        orderBy: { submittedAt: "asc" },
      });
      response.json({
        assignment: { id: assignment.id, title: assignment.title },
        count: submissions.length,
        submissions: submissions.map(toSubmissionDto),
      });
    } catch (error) {
      sendServerError(response, "Failed to summarize submissions", error);
    }
  });

  router.get("/submissions/:id", async (request, response) => {
    try {
      const access = await findAccessibleSubmission(request.params.id, input.currentUser(response)!);
      if (access.kind === "missing") return response.status(404).json({ message: "Submission not found" });
      if (access.kind === "forbidden") return response.status(403).json({ message: "Submission access denied" });
      response.json(toSubmissionDto(access.submission));
    } catch (error) {
      sendServerError(response, "Failed to get submission", error);
    }
  });

  router.post("/submissions/:id/evaluate", async (request, response) => {
    const submissionId = request.params.id;
    try {
      const user = input.currentUser(response)!;
      const access = await findAccessibleSubmission(submissionId, user);
      if (access.kind === "missing") return response.status(404).json({ message: "Submission not found" });
      if (access.kind === "forbidden") return response.status(403).json({ message: "Submission access denied" });
      const result = await input.grading.evaluateSubmission({ submissionId, actorId: user.id });
      if (!result) return response.status(404).json({ message: "Submission not found" });
      response.json({ evaluation: toEvaluationDto(result.evaluation), agent: result.agent });
    } catch (error) {
      if (sendGradingError(response, error)) return;
      logError("evaluation.http_request_failed", error, {
        requestId: response.locals.requestId,
        submissionId,
      });
      response.status(502).json({ message: "Failed to evaluate submission", requestId: response.locals.requestId });
    }
  });

  router.get("/submissions/:id/evaluation", async (request, response) => {
    try {
      const access = await findAccessibleSubmission(request.params.id, input.currentUser(response)!);
      if (access.kind === "missing") return response.status(404).json({ message: "Submission not found" });
      if (access.kind === "forbidden") return response.status(403).json({ message: "Submission access denied" });
      const evaluation = await input.database.evaluation.findUnique({
        where: { submissionId: request.params.id },
        include: { reviewedBy: { select: { id: true, username: true, displayName: true } } },
      });
      if (!evaluation) return response.status(404).json({ message: "Evaluation not found" });
      response.json(toEvaluationDto(evaluation));
    } catch (error) {
      sendServerError(response, "Failed to get evaluation", error);
    }
  });

  router.get("/submissions/:id/evaluation-audits", async (request, response) => {
    try {
      const access = await findAccessibleSubmission(request.params.id, input.currentUser(response)!);
      if (access.kind === "missing") return response.status(404).json({ message: "Submission not found" });
      if (access.kind === "forbidden") return response.status(403).json({ message: "Submission access denied" });
      const audits = await input.database.evaluationAudit.findMany({
        where: { submissionId: request.params.id },
        include: { actor: { select: { id: true, username: true, displayName: true } } },
        orderBy: { createdAt: "asc" },
      });
      response.json({
        submissionId: request.params.id,
        count: audits.length,
        audits: audits.map(toEvaluationAuditDto),
      });
    } catch (error) {
      sendServerError(response, "Failed to get evaluation audits", error);
    }
  });

  return router;
}
