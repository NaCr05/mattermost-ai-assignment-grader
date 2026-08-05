type PublicEvaluationSource = {
  id: string;
  submissionId: string;
  completenessLevel: string;
  completenessComment: string;
  correctnessLevel: string;
  correctnessComment: string;
  mainProblems: unknown;
  suggestions: unknown;
  score: number;
  grade: string;
  status: string;
  version: number;
  reviewedById: string | null;
  reviewedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  reviewedBy?: unknown;
};

export function toEvaluationDto(evaluation: PublicEvaluationSource) {
  return {
    id: evaluation.id,
    submissionId: evaluation.submissionId,
    completenessLevel: evaluation.completenessLevel,
    completenessComment: evaluation.completenessComment,
    correctnessLevel: evaluation.correctnessLevel,
    correctnessComment: evaluation.correctnessComment,
    mainProblems: evaluation.mainProblems,
    suggestions: evaluation.suggestions,
    score: evaluation.score,
    grade: evaluation.grade,
    status: evaluation.status,
    version: evaluation.version,
    reviewedById: evaluation.reviewedById,
    reviewedAt: evaluation.reviewedAt,
    ...(evaluation.reviewedBy !== undefined
      ? { reviewedBy: evaluation.reviewedBy }
      : {}),
    createdAt: evaluation.createdAt,
    updatedAt: evaluation.updatedAt,
  };
}

export function toSubmissionDto<T extends { evaluation?: PublicEvaluationSource | null }>(
  submission: T,
) {
  const { evaluation, ...publicSubmission } = submission;
  return {
    ...publicSubmission,
    ...(evaluation !== undefined
      ? { evaluation: evaluation ? toEvaluationDto(evaluation) : null }
      : {}),
  };
}

function redactSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSnapshot);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "agentRawOutput" || key === "errorMessage" || key === "raw_output") {
      continue;
    }
    redacted[key] = redactSnapshot(nestedValue);
  }
  return redacted;
}

export function toEvaluationAuditDto<T extends {
  agentRawOutput?: unknown;
  snapshot: unknown;
}>(audit: T) {
  const { agentRawOutput: _agentRawOutput, snapshot, ...publicAudit } = audit;
  return {
    ...publicAudit,
    snapshot: redactSnapshot(snapshot),
  };
}
