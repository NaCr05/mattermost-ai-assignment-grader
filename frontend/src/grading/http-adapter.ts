import type {
  Assignment,
  EvaluationAuditResponse,
  SubmissionSummary,
} from "../types/grading";
import type { GradingGateway } from "./gateway";
import { getCsrfToken } from "../auth/session-store";

const DEFAULT_BASE_URL = "http://localhost:3001";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new Error("服务器返回了无法解析的响应。");
      }
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String(data.message)
        : `请求失败：${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export function createHttpGradingGateway(
  baseUrl = import.meta.env.VITE_API_URL ?? DEFAULT_BASE_URL,
  request: typeof fetch = fetch,
): GradingGateway {
  async function send(path: string, init?: RequestInit) {
    const response = await request(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "x-csrf-token": getCsrfToken(),
        ...init?.headers,
      },
    });
    await readJson<unknown>(response);
  }

  return {
    async listAssignments(signal) {
      const response = await request(`${baseUrl}/assignments`, { signal, credentials: "include" });
      return readJson<Assignment[]>(response);
    },

    async loadSubmissionSummary(assignmentId, signal) {
      const response = await request(
        `${baseUrl}/assignments/${assignmentId}/submissions`,
        { signal, credentials: "include" },
      );
      return readJson<SubmissionSummary>(response);
    },

    async loadEvaluationAudits(submissionId) {
      const response = await request(
        `${baseUrl}/submissions/${submissionId}/evaluation-audits`,
        { credentials: "include" },
      );
      return readJson<EvaluationAuditResponse>(response);
    },

    evaluateSubmission(submissionId) {
      return send(`/submissions/${submissionId}/evaluate`, { method: "POST" });
    },

    confirmEvaluation(evaluationId) {
      return send(`/evaluations/${evaluationId}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
    },

    regradeEvaluation(evaluationId) {
      return send(`/evaluations/${evaluationId}/regrade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
    },

    updateEvaluation(evaluationId, update) {
      return send(`/evaluations/${evaluationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });
    },
  };
}

export const gradingGateway = createHttpGradingGateway();
