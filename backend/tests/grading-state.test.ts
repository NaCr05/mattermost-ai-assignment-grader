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

    await suite.test("regrade failure marks both Submission and Evaluation failed", async () => {
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
  } finally {
    await prisma.assignment.deleteMany({ where: { createdById: teacher.id } });
    await prisma.user.deleteMany({ where: { id: { in: [teacher.id, student.id] } } });
    await prisma.$disconnect();
    await pool.end();
  }
});
