import type {
  Assignment,
  Evaluation,
  EvaluationAuditResponse,
  SubmissionSummary,
} from "../types/grading";

export type EvaluationUpdate = {
  expectedVersion: number;
  score: number;
  grade: Evaluation["grade"];
  correctnessComment: string;
};

export type GradingGateway = {
  listAssignments(signal?: AbortSignal): Promise<Assignment[]>;
  loadSubmissionSummary(
    assignmentId: string,
    signal?: AbortSignal,
  ): Promise<SubmissionSummary>;
  loadEvaluationAudits(submissionId: string): Promise<EvaluationAuditResponse>;
  evaluateSubmission(submissionId: string): Promise<void>;
  confirmEvaluation(evaluationId: string): Promise<void>;
  regradeEvaluation(evaluationId: string): Promise<void>;
  updateEvaluation(
    evaluationId: string,
    update: EvaluationUpdate,
  ): Promise<void>;
};
