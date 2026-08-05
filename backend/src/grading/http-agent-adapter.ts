import { randomUUID } from "node:crypto";
import {
  parseEvaluationAgentResult,
  type EvaluationAgent,
} from "./agent-port";

type HttpAgentAdapterOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
};

export class EvaluationAgentError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EvaluationAgentError";
  }
}

export function createHttpEvaluationAgent(
  options: HttpAgentAdapterOptions = {},
): EvaluationAgent {
  const baseUrl = options.baseUrl ?? process.env.AGENT_URL ?? "http://localhost:8000";
  const timeoutMs = options.timeoutMs ?? 60_000;
  const request = options.fetchImplementation ?? fetch;

  return {
    async evaluate(input) {
      let response: Response;
      const requestId = randomUUID();

      try {
        response = await request(`${baseUrl}/evaluate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": requestId,
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new EvaluationAgentError("Evaluation Agent request failed.", undefined, {
          cause: error,
        });
      }

      if (!response.ok) {
        throw new EvaluationAgentError(
          `Evaluation Agent returned HTTP ${response.status}.`,
          response.status,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw new EvaluationAgentError("Evaluation Agent returned invalid JSON.", response.status, {
          cause: error,
        });
      }

      try {
        return parseEvaluationAgentResult(
          payload,
          response.headers.get("x-request-id") ?? requestId,
        );
      } catch (error) {
        throw new EvaluationAgentError("Evaluation Agent response failed validation.", response.status, {
          cause: error,
        });
      }
    },
  };
}
