import type {
  EvaluationAgent,
  EvaluationAgentInput,
  EvaluationAgentResult,
} from "./agent-port";

type FakeResultFactory = (
  input: EvaluationAgentInput,
) => EvaluationAgentResult | Promise<EvaluationAgentResult>;

export function createFakeEvaluationAgent(
  result: EvaluationAgentResult | FakeResultFactory,
): EvaluationAgent {
  return {
    async evaluate(input) {
      return typeof result === "function" ? result(input) : result;
    },
  };
}
