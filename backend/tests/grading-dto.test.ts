import assert from "node:assert/strict";
import test from "node:test";
import {
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
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("evaluation DTO exposes review data without internal model output", () => {
  const dto = toEvaluationDto(evaluation);
  assert.equal(dto.id, evaluation.id);
  assert.equal(dto.score, evaluation.score);
  assert.equal("agentRawOutput" in dto, false);
  assert.equal("errorMessage" in dto, false);
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
  const submission = toSubmissionDto({
    id: "submission-1",
    evaluation,
  });
  assert.equal("agentRawOutput" in submission.evaluation!, false);

  const audit = toEvaluationAuditDto({
    id: "audit-1",
    agentRawOutput: "private audit output",
    snapshot: {
      evaluation,
      agent: { provider: "mock", raw_output: "private nested output" },
    },
  });
  const serialized = JSON.stringify(audit);
  assert.doesNotMatch(serialized, /private model output/);
  assert.doesNotMatch(serialized, /private provider error/);
  assert.doesNotMatch(serialized, /private audit output/);
  assert.doesNotMatch(serialized, /private nested output/);
  assert.doesNotMatch(serialized, /private-model-name|private-prompt-version/);
});
