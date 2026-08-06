import assert from "node:assert/strict";
import test from "node:test";
import {
  toAssignmentDto,
  toEvaluationAuditDto,
  toEvaluationDto,
  toSubmissionDto,
} from "../src/grading/dto";

const evaluation = {
  id: "evaluation-1",
  submissionId: "submission-1",
  completenessLevel: "complete",
  completenessComment: "Complete.",
  correctnessLevel: "correct",
  correctnessComment: "Correct.",
  mainProblems: ["None."],
  suggestions: ["Keep going."],
  score: 95,
  grade: "A",
  status: "generated",
  agentRawOutput: "private model output",
  errorMessage: "private provider error",
  agentProvider: "deepseek",
  modelName: "private-model-name",
  promptVersion: "private-prompt-version",
  inputTokens: 100,
  outputTokens: 50,
  totalTokens: 150,
  agentDurationMs: 12.5,
  estimatedCostUsd: 0.01,
  version: 1,
  reviewedById: null,
  reviewedAt: null,
  reviewedBy: {
    id: "teacher-1",
    username: "teacher",
    displayName: "Teacher",
    passwordHash: "private password hash",
  },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  futurePrivateField: "future evaluation secret",
};

test("evaluation DTO exposes review data without internal model output", () => {
  const dto = toEvaluationDto(evaluation);
  assert.equal(dto.id, evaluation.id);
  assert.equal(dto.score, evaluation.score);
  assert.equal("agentRawOutput" in dto, false);
  assert.equal("errorMessage" in dto, false);
  assert.equal("futurePrivateField" in dto, false);
  assert.equal("passwordHash" in dto.reviewedBy!, false);
  for (const privateField of [
    "agentProvider",
    "modelName",
    "promptVersion",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "agentDurationMs",
    "estimatedCostUsd",
  ]) {
    assert.equal(privateField in dto, false);
  }
});

test("submission and audit DTOs redact nested model output", () => {
  const timestamp = new Date("2026-01-01T00:00:00.000Z");
  const assignment = {
    id: "assignment-1",
    title: "Assignment",
    question: "Question?",
    deadline: timestamp,
    instructions: null,
    status: "published",
    createdById: "teacher-1",
    createdBy: {
      id: "teacher-1",
      username: "teacher",
      displayName: "Teacher",
      role: "teacher",
      passwordHash: "private creator password hash",
    },
    _count: { submissions: 1, futurePrivateCount: 99 },
    createdAt: timestamp,
    updatedAt: timestamp,
    deploymentSecret: "future assignment secret",
  };
  const publicAssignment = toAssignmentDto(assignment);
  assert.equal("deploymentSecret" in publicAssignment, false);
  assert.equal("passwordHash" in publicAssignment.createdBy!, false);
  assert.deepEqual(publicAssignment._count, { submissions: 1 });

  const privateStudent = {
    id: "student-1",
    username: "student",
    displayName: "Student",
    role: "student",
    email: "private@example.test",
  };
  const privateSubmission = {
    id: "submission-1",
    assignmentId: assignment.id,
    studentId: "student-1",
    answer: "Answer",
    status: "evaluated",
    submittedAt: timestamp,
    assignment,
    student: privateStudent,
    evaluation,
    createdAt: timestamp,
    updatedAt: timestamp,
    futurePrivateField: "future submission secret",
  };
  const submission = toSubmissionDto(privateSubmission);
  assert.equal("agentRawOutput" in submission.evaluation!, false);
  assert.equal("futurePrivateField" in submission, false);
  assert.equal("email" in submission.student!, false);

  const privateActor = {
    id: "teacher-1",
    username: "teacher",
    displayName: "Teacher",
    passwordHash: "private actor password hash",
  };
  const privateAudit = {
    id: "audit-1",
    evaluationId: evaluation.id,
    submissionId: "submission-1",
    action: "generated",
    version: 1,
    agentRawOutput: "private audit output",
    snapshot: {
      evaluation,
      agent: {
        provider: "mock",
        attempts: 1,
        raw_output: "private nested output",
        providerToken: "future agent secret",
      },
      futurePrivateField: "future snapshot secret",
    },
    actorId: "teacher-1",
    actor: privateActor,
    createdAt: timestamp,
    futurePrivateField: "future audit secret",
  };
  const audit = toEvaluationAuditDto(privateAudit);
  const serialized = JSON.stringify(audit);
  assert.doesNotMatch(serialized, /private model output/);
  assert.doesNotMatch(serialized, /private provider error/);
  assert.doesNotMatch(serialized, /private audit output/);
  assert.doesNotMatch(serialized, /private nested output/);
  assert.doesNotMatch(serialized, /private-model-name|private-prompt-version/);
  assert.doesNotMatch(serialized, /future .* secret|password hash|private@example/);
  assert.deepEqual((audit.snapshot as { agent: unknown }).agent, {
    provider: "mock",
    attempts: 1,
  });
});
