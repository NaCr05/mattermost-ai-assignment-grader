export const completenessLevels = ["complete", "partial", "incomplete"] as const;
export const correctnessLevels = [
  "correct",
  "mostly_correct",
  "partially_correct",
  "incorrect",
  "uncertain",
] as const;
export const evaluationGrades = ["A", "B", "C", "D", "F"] as const;

export type EvaluationAgentInput = {
  assignment: {
    title: string;
    question: string;
    instructions: string | null;
  };
  submission: {
    student: string;
    answer: string;
  };
  rubric: string | null;
};

export type EvaluationAgentResult = {
  completeness: {
    level: (typeof completenessLevels)[number];
    comment: string;
  };
  correctness: {
    level: (typeof correctnessLevels)[number];
    comment: string;
  };
  main_problems: string[];
  suggestions: string[];
  score: number;
  grade: (typeof evaluationGrades)[number];
  provider: "mock" | "deepseek";
  attempts: number;
  raw_output: string;
  observability?: {
    requestId?: string;
    modelName: string;
    promptVersion: string;
    durationMs: number;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
    };
  };
};

export type EvaluationAgent = {
  evaluate(input: EvaluationAgentInput): Promise<EvaluationAgentResult>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isNonEmptyString(item))
  );
}

function parseNonnegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function parseEvaluationAgentResult(
  value: unknown,
  requestId?: string,
): EvaluationAgentResult {
  if (!isRecord(value)) {
    throw new Error("Evaluation Agent response must be an object.");
  }

  const completeness = value.completeness;
  const correctness = value.correctness;

  if (
    !isRecord(completeness) ||
    !completenessLevels.includes(completeness.level as never) ||
    !isNonEmptyString(completeness.comment)
  ) {
    throw new Error("Evaluation Agent completeness result is invalid.");
  }

  if (
    !isRecord(correctness) ||
    !correctnessLevels.includes(correctness.level as never) ||
    !isNonEmptyString(correctness.comment)
  ) {
    throw new Error("Evaluation Agent correctness result is invalid.");
  }

  if (
    !isNonEmptyStringList(value.main_problems) ||
    !isNonEmptyStringList(value.suggestions)
  ) {
    throw new Error("Evaluation Agent feedback lists are invalid.");
  }

  if (!Number.isInteger(value.score) || Number(value.score) < 0 || Number(value.score) > 100) {
    throw new Error("Evaluation Agent score is invalid.");
  }

  if (!evaluationGrades.includes(value.grade as never)) {
    throw new Error("Evaluation Agent grade is invalid.");
  }

  if (value.provider !== "mock" && value.provider !== "deepseek") {
    throw new Error("Evaluation Agent provider is invalid.");
  }

  if (!Number.isInteger(value.attempts) || Number(value.attempts) < 1 || Number(value.attempts) > 2) {
    throw new Error("Evaluation Agent attempts value is invalid.");
  }

  if (typeof value.raw_output !== "string") {
    throw new Error("Evaluation Agent raw output is invalid.");
  }

  let observability: EvaluationAgentResult["observability"];
  if (value.observability !== undefined) {
    if (!isRecord(value.observability) || !isRecord(value.observability.usage)) {
      throw new Error("Evaluation Agent observability result is invalid.");
    }
    const durationMs = parseNonnegativeNumber(value.observability.duration_ms);
    const inputTokens = parseNonnegativeNumber(value.observability.usage.input_tokens);
    const outputTokens = parseNonnegativeNumber(value.observability.usage.output_tokens);
    const totalTokens = parseNonnegativeNumber(value.observability.usage.total_tokens);
    const estimatedCostUsd = parseNonnegativeNumber(
      value.observability.usage.estimated_cost_usd,
    );
    if (
      !isNonEmptyString(value.observability.model_name) ||
      !isNonEmptyString(value.observability.prompt_version) ||
      durationMs === null ||
      inputTokens === null ||
      outputTokens === null ||
      totalTokens === null ||
      estimatedCostUsd === null
    ) {
      throw new Error("Evaluation Agent observability result is invalid.");
    }
    observability = {
      requestId,
      modelName: value.observability.model_name,
      promptVersion: value.observability.prompt_version,
      durationMs,
      usage: { inputTokens, outputTokens, totalTokens, estimatedCostUsd },
    };
  }

  return {
    completeness: {
      level: completeness.level as EvaluationAgentResult["completeness"]["level"],
      comment: completeness.comment,
    },
    correctness: {
      level: correctness.level as EvaluationAgentResult["correctness"]["level"],
      comment: correctness.comment,
    },
    main_problems: value.main_problems,
    suggestions: value.suggestions,
    score: Number(value.score),
    grade: value.grade as EvaluationAgentResult["grade"],
    provider: value.provider,
    attempts: Number(value.attempts),
    raw_output: value.raw_output,
    ...(observability ? { observability } : {}),
  };
}
