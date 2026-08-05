import type { GradingGateway } from "./gateway";

export function createFakeGradingGateway(
  overrides: Partial<GradingGateway> = {},
): GradingGateway {
  return {
    listAssignments: async () => [],
    loadSubmissionSummary: async (assignmentId) => ({
      assignment: { id: assignmentId, title: "Test assignment" },
      count: 0,
      submissions: [],
    }),
    loadEvaluationAudits: async (submissionId) => ({
      submissionId,
      count: 0,
      audits: [],
    }),
    evaluateSubmission: async () => undefined,
    confirmEvaluation: async () => undefined,
    regradeEvaluation: async () => undefined,
    updateEvaluation: async () => undefined,
    ...overrides,
  };
}
