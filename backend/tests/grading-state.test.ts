import assert from "node:assert/strict";
import test from "node:test";
import { createFakeEvaluationAgent } from "../src/grading/fake-agent-adapter";
import { createGradingModule, GradingError } from "../src/grading/module";
import type { EvaluationAgentResult } from "../src/grading/agent-port";
import { pool, prisma } from "../src/prisma";

const result: EvaluationAgentResult = {
  completeness: { level: "complete", comment: "Complete." },
  correctness: { level: "correct", comment: "Correct." },
  main_problems: ["No material problems."],
  suggestions: ["Keep testing."],
  score: 90,
  grade: "A",
  provider: "mock",
  attempts: 1,
  raw_output: "private raw output",
  observability: {
    requestId: "state-agent-request",
    modelName: "test-model-v1",
    promptVersion: "test-prompt-v1",
    durationMs: 12.5,
    usage: {
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      estimatedCostUsd: 0.0012,
    },
  },
};

test("Grading Module preserves failure and concurrency invariants", async (suite) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const teacher = await prisma.user.create({
    data: { username: `state-teacher-${suffix}`, displayName: "State Teacher", role: "teacher" },
  });
  const student = await prisma.user.create({
    data: { username: `state-student-${suffix}`, displayName: "State Student", role: "student" },
  });
  async function submission(label: string) {
    const assignment = await prisma.assignment.create({
      data: {
        title: `State test assignment: ${label}`,
        question: "Explain the answer.",
        deadline: new Date("2028-01-01T00:00:00.000Z"),
        createdById: teacher.id,
      },
    });
    return prisma.submission.create({
      data: { assignmentId: assignment.id, studentId: student.id, answer: label },
    });
  }

  try {
    await suite.test("initial failure leaves Submission failed without a partial Evaluation", async () => {
      const record = await submission("initial failure");
      const grading = createGradingModule({
        database: prisma,
        evaluationAgent: createFakeEvaluationAgent(async () => {
          throw new Error("upstream secret");
        }),
      });
      await assert.rejects(() => grading.evaluateSubmission({ submissionId: record.id }));
      const saved = await prisma.submission.findUniqueOrThrow({
        where: { id: record.id },
        include: { evaluation: true },
      });
      assert.equal(saved.status, "failed");
      assert.equal(saved.evaluation, null);
    });

    await suite.test("successful evaluation persists reproducibility metadata", async () => {
      const record = await submission("observability persistence");
      const grading = createGradingModule({
        database: prisma,
        evaluationAgent: createFakeEvaluationAgent(result),
      });
      const generated = await grading.evaluateSubmission({ submissionId: record.id });
      assert.ok(generated);
      const saved = await prisma.evaluation.findUniqueOrThrow({ where: { id: generated.evaluation.id } });
      assert.equal(saved.agentProvider, "mock");
      assert.equal(saved.agentRequestId, "state-agent-request");
      assert.equal(saved.agentAttempts, 1);
      assert.equal(saved.modelName, "test-model-v1");
      assert.equal(saved.promptVersion, "test-prompt-v1");
      assert.equal(saved.agentDurationMs, 12.5);
      assert.equal(saved.inputTokens, 100);
      assert.equal(saved.outputTokens, 40);
      assert.equal(saved.totalTokens, 140);
      assert.equal(saved.estimatedCostUsd?.toString(), "0.0012");
    });

    await suite.test("regrade failure marks both records failed and a reviewed edit restores consistency", async () => {
      const record = await submission("regrade failure");
      const success = createGradingModule({ database: prisma, evaluationAgent: createFakeEvaluationAgent(result) });
      const generated = await success.evaluateSubmission({ submissionId: record.id });
      assert.ok(generated);
      const failure = createGradingModule({
        database: prisma,
        evaluationAgent: createFakeEvaluationAgent(async () => { throw new Error("provider secret"); }),
      });
      await assert.rejects(() => failure.reviewEvaluation({
        kind: "regrade",
        evaluationId: generated.evaluation.id,
        actorId: teacher.id,
      }));
      const [savedSubmission, savedEvaluation] = await Promise.all([
        prisma.submission.findUniqueOrThrow({ where: { id: record.id } }),
        prisma.evaluation.findUniqueOrThrow({ where: { id: generated.evaluation.id } }),
      ]);
      assert.equal(savedSubmission.status, "failed");
      assert.equal(savedEvaluation.status, "failed");
      assert.equal(savedEvaluation.errorMessage, "Evaluation Agent request failed.");
      assert.doesNotMatch(savedEvaluation.errorMessage ?? "", /provider secret/);
      assert.equal(savedEvaluation.version, generated.evaluation.version + 1);

      const recovered = await failure.reviewEvaluation({
        kind: "modify",
        evaluationId: savedEvaluation.id,
        actorId: teacher.id,
        expectedVersion: savedEvaluation.version,
        changes: { score: 80 },
      });
      assert.ok(recovered);
      const [recoveredSubmission, recoveredEvaluation] = await Promise.all([
        prisma.submission.findUniqueOrThrow({ where: { id: record.id } }),
        prisma.evaluation.findUniqueOrThrow({ where: { id: savedEvaluation.id } }),
      ]);
      assert.equal(recoveredSubmission.status, "evaluated");
      assert.equal(recoveredEvaluation.status, "modified");
      assert.equal(recoveredEvaluation.errorMessage, null);
    });

    await suite.test("two initial evaluations allow one owner and one conflict", async () => {
      const record = await submission("concurrent initial evaluation");
      const grading = createGradingModule({
        database: prisma,
        evaluationAgent: createFakeEvaluationAgent(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return result;
        }),
      });
      const attempts = await Promise.allSettled([
        grading.evaluateSubmission({ submissionId: record.id }),
        grading.evaluateSubmission({ submissionId: record.id }),
      ]);
      assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
      const rejected = attempts.find((attempt) => attempt.status === "rejected") as PromiseRejectedResult;
      assert.ok(rejected.reason instanceof GradingError);
      assert.equal(rejected.reason.code, "conflict");
      assert.equal(await prisma.evaluation.count({ where: { submissionId: record.id } }), 1);
      assert.equal(await prisma.evaluationAudit.count({ where: { submissionId: record.id } }), 1);
      assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: record.id } })).status, "evaluated");
    });

    await suite.test("two writes from one old version allow exactly one winner", async () => {
      const record = await submission("concurrent review");
      const grading = createGradingModule({ database: prisma, evaluationAgent: createFakeEvaluationAgent(result) });
      const generated = await grading.evaluateSubmission({ submissionId: record.id });
      assert.ok(generated);
      const commands = [91, 92].map((score) => grading.reviewEvaluation({
        kind: "modify" as const,
        evaluationId: generated.evaluation.id,
        actorId: teacher.id,
        expectedVersion: generated.evaluation.version,
        changes: { score },
      }));
      const writes = await Promise.allSettled(commands);
      assert.equal(writes.filter((write) => write.status === "fulfilled").length, 1);
      const rejected = writes.find((write) => write.status === "rejected") as PromiseRejectedResult;
      assert.ok(rejected.reason instanceof GradingError);
      assert.equal(rejected.reason.code, "conflict");
    });

    await suite.test("confirm advances the version and invalidates an older edit", async () => {
      const record = await submission("confirm invalidates old edit");
      const grading = createGradingModule({ database: prisma, evaluationAgent: createFakeEvaluationAgent(result) });
      const generated = await grading.evaluateSubmission({ submissionId: record.id });
      assert.ok(generated);

      const confirmed = await grading.reviewEvaluation({
        kind: "confirm",
        evaluationId: generated.evaluation.id,
        actorId: teacher.id,
      });
      assert.ok(confirmed);
      assert.equal(confirmed.evaluation.version, generated.evaluation.version + 1);

      await assert.rejects(
        () => grading.reviewEvaluation({
          kind: "modify",
          evaluationId: generated.evaluation.id,
          actorId: teacher.id,
          expectedVersion: generated.evaluation.version,
          changes: { score: 77 },
        }),
        (error: unknown) => error instanceof GradingError && error.code === "conflict",
      );
    });

    await suite.test("two concurrent regrades invoke the Agent exactly once", async () => {
      const record = await submission("concurrent regrade");
      const initial = createGradingModule({ database: prisma, evaluationAgent: createFakeEvaluationAgent(result) });
      const generated = await initial.evaluateSubmission({ submissionId: record.id });
      assert.ok(generated);

      let agentCalls = 0;
      const grading = createGradingModule({
        database: prisma,
        evaluationAgent: createFakeEvaluationAgent(async () => {
          agentCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return result;
        }),
      });
      const attempts = await Promise.allSettled([
        grading.reviewEvaluation({ kind: "regrade", evaluationId: generated.evaluation.id, actorId: teacher.id }),
        grading.reviewEvaluation({ kind: "regrade", evaluationId: generated.evaluation.id, actorId: teacher.id }),
      ]);

      assert.equal(agentCalls, 1);
      assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
      const rejected = attempts.find((attempt) => attempt.status === "rejected") as PromiseRejectedResult;
      assert.ok(rejected.reason instanceof GradingError);
      assert.equal(rejected.reason.code, "conflict");
      assert.equal(await prisma.evaluationAudit.count({
        where: { submissionId: record.id, action: "regraded" },
      }), 1);
    });
  } finally {
    await prisma.assignment.deleteMany({ where: { createdById: teacher.id } });
    await prisma.user.deleteMany({ where: { id: { in: [teacher.id, student.id] } } });
    await prisma.$disconnect();
    await pool.end();
  }
});
