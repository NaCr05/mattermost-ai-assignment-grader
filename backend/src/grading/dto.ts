type PublicUserSource = {
  id: string;
  username: string;
  displayName: string;
  role?: string;
};

type PublicAssignmentSource = {
  id: string;
  title: string;
  question: string;
  deadline: Date | string;
  instructions: string | null;
  status: string;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy?: PublicUserSource;
  _count?: { submissions: number };
};

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
  reviewedBy?: PublicUserSource | null;
};

type PublicSubmissionSource = {
  id: string;
  assignmentId: string;
  studentId: string;
  answer: string;
  status: string;
  submittedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  assignment?: PublicAssignmentSource;
  student?: PublicUserSource;
  evaluation?: PublicEvaluationSource | null;
};

type PublicEvaluationAuditSource = {
  id: string;
  evaluationId: string | null;
  submissionId: string;
  action: string;
  version: number;
  snapshot: unknown;
  actorId: string | null;
  actor?: PublicUserSource | null;
  createdAt: Date | string;
};

function toPublicUserDto(user: PublicUserSource) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    ...(user.role !== undefined ? { role: user.role } : {}),
  };
}

export function toAssignmentDto(assignment: PublicAssignmentSource) {
  return {
    id: assignment.id,
    title: assignment.title,
    question: assignment.question,
    deadline: assignment.deadline,
    instructions: assignment.instructions,
    status: assignment.status,
    createdById: assignment.createdById,
    ...(assignment.createdBy !== undefined
      ? { createdBy: toPublicUserDto(assignment.createdBy) }
      : {}),
    ...(assignment._count !== undefined
      ? { _count: { submissions: assignment._count.submissions } }
      : {}),
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

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
      ? {
          reviewedBy: evaluation.reviewedBy
            ? toPublicUserDto(evaluation.reviewedBy)
            : null,
        }
      : {}),
    createdAt: evaluation.createdAt,
    updatedAt: evaluation.updatedAt,
  };
}

export function toSubmissionDto(submission: PublicSubmissionSource) {
  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    studentId: submission.studentId,
    answer: submission.answer,
    status: submission.status,
    submittedAt: submission.submittedAt,
    ...(submission.assignment !== undefined
      ? { assignment: toAssignmentDto(submission.assignment) }
      : {}),
    ...(submission.student !== undefined
      ? { student: toPublicUserDto(submission.student) }
      : {}),
    ...(submission.evaluation !== undefined
      ? {
          evaluation: submission.evaluation
            ? toEvaluationDto(submission.evaluation)
            : null,
        }
      : {}),
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const evaluationSnapshotFields = [
  "id",
  "submissionId",
  "completenessLevel",
  "completenessComment",
  "correctnessLevel",
  "correctnessComment",
  "mainProblems",
  "suggestions",
  "score",
  "grade",
  "status",
  "version",
  "reviewedById",
  "reviewedAt",
  "createdAt",
  "updatedAt",
] as const;

function projectEvaluationSnapshot(value: unknown) {
  if (!isRecord(value)) return {};

  const projected: Record<string, unknown> = {};
  for (const field of evaluationSnapshotFields) {
    if (field in value) projected[field] = value[field];
  }
  if (isRecord(value.reviewedBy)) {
    const { id, username, displayName } = value.reviewedBy;
    if (
      typeof id === "string" &&
      typeof username === "string" &&
      typeof displayName === "string"
    ) {
      projected.reviewedBy = toPublicUserDto({ id, username, displayName });
    }
  } else if (value.reviewedBy === null) {
    projected.reviewedBy = null;
  }
  return projected;
}

function projectAuditSnapshot(value: unknown): unknown {
  if (!isRecord(value)) return {};

  if (!("evaluation" in value)) {
    return projectEvaluationSnapshot(value);
  }

  const projected: Record<string, unknown> = {
    evaluation: projectEvaluationSnapshot(value.evaluation),
  };
  if (typeof value.baselineImported === "boolean") {
    projected.baselineImported = value.baselineImported;
  }
  if (isRecord(value.agent)) {
    const agent: Record<string, unknown> = {};
    if (typeof value.agent.provider === "string") {
      agent.provider = value.agent.provider;
    }
    if (typeof value.agent.attempts === "number") {
      agent.attempts = value.agent.attempts;
    }
    projected.agent = agent;
  }
  return projected;
}

export function toEvaluationAuditDto(audit: PublicEvaluationAuditSource) {
  return {
    id: audit.id,
    evaluationId: audit.evaluationId,
    submissionId: audit.submissionId,
    action: audit.action,
    version: audit.version,
    snapshot: projectAuditSnapshot(audit.snapshot),
    actorId: audit.actorId,
    ...(audit.actor !== undefined
      ? { actor: audit.actor ? toPublicUserDto(audit.actor) : null }
      : {}),
    createdAt: audit.createdAt,
  };
}
