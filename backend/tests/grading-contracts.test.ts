import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEvaluationAgentResult,
  type EvaluationAgentResult,
} from "../src/grading/agent-port";
import { createFakeEvaluationAgent } from "../src/grading/fake-agent-adapter";
import {
  createHttpEvaluationAgent,
  EvaluationAgentError,
} from "../src/grading/http-agent-adapter";
import { serializeError } from "../src/logger";

const validResult: EvaluationAgentResult = {
  completeness: { level: "complete", comment: "Complete answer." },
  correctness: { level: "correct", comment: "Correct answer." },
  main_problems: ["No material problems."],
  suggestions: ["Keep the explanation concise."],
  score: 95,
  grade: "A",
  provider: "mock",
  attempts: 1,
  raw_output: "internal model output",
};

const input = {
  assignment: {
    title: "Stacks",
    question: "Explain LIFO.",
    instructions: null,
  },
  submission: {
    student: "Demo Student",
    answer: "The last item pushed is the first item popped.",
  },
  rubric: null,
};

test("Agent result parser accepts the documented contract", () => {
  assert.deepEqual(parseEvaluationAgentResult(validResult), validResult);
});

test("Agent result parser rejects invalid enum and list values", () => {
  assert.throws(
    () =>
      parseEvaluationAgentResult({
        ...validResult,
        correctness: { level: "probably", comment: "Invalid enum." },
      }),
    /correctness result is invalid/,
  );

  assert.throws(
    () =>
      parseEvaluationAgentResult({
        ...validResult,
        suggestions: ["valid", 42],
      }),
    /feedback lists are invalid/,
  );
});

test("Agent observability is validated without entering the public grading DTO", () => {
  const parsed = parseEvaluationAgentResult({
    ...validResult,
    observability: {
      model_name: "mock-rules-v1",
      prompt_version: "test-v1",
      duration_ms: 12.5,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        estimated_cost_usd: 0,
      },
    },
  }, "agent-request-1");
  assert.deepEqual(parsed.observability, {
    requestId: "agent-request-1",
    modelName: "mock-rules-v1",
    promptVersion: "test-v1",
    durationMs: 12.5,
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      estimatedCostUsd: 0,
    },
  });
});

test("Fake Agent adapter crosses the same seam as the HTTP adapter", async () => {
  const agent = createFakeEvaluationAgent(validResult);
  assert.deepEqual(await agent.evaluate(input), validResult);
});

test("HTTP Agent adapter does not copy upstream response bodies into errors", async () => {
  const agent = createHttpEvaluationAgent({
    baseUrl: "http://agent.invalid",
    fetchImplementation: async () =>
      new Response("sensitive upstream body", { status: 500 }),
  });

  await assert.rejects(
    () => agent.evaluate(input),
    (error: unknown) => {
      assert.ok(error instanceof EvaluationAgentError);
      assert.equal(error.status, 500);
      assert.doesNotMatch(error.message, /sensitive upstream body/);
      return true;
    },
  );
});

test("HTTP Agent adapter maps invalid JSON without exposing the response", async () => {
  const agent = createHttpEvaluationAgent({
    fetchImplementation: async () =>
      new Response('{"private":', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  await assert.rejects(
    () => agent.evaluate(input),
    (error: unknown) => {
      assert.ok(error instanceof EvaluationAgentError);
      assert.equal(error.message, "Evaluation Agent returned invalid JSON.");
      assert.doesNotMatch(error.message, /private/);
      return true;
    },
  );
});

test("HTTP Agent adapter maps transport timeouts to a stable error", async () => {
  const agent = createHttpEvaluationAgent({
    timeoutMs: 1,
    fetchImplementation: async () => {
      throw new DOMException("request timed out with internal address", "AbortError");
    },
  });

  await assert.rejects(
    () => agent.evaluate(input),
    (error: unknown) => {
      assert.ok(error instanceof EvaluationAgentError);
      assert.equal(error.message, "Evaluation Agent request failed.");
      assert.doesNotMatch(error.message, /internal address/);
      return true;
    },
  );
});

test("structured logs redact error messages and stacks by default", () => {
  const previous = process.env.LOG_ERROR_DETAILS;
  delete process.env.LOG_ERROR_DETAILS;
  try {
    const serialized = serializeError(new Error("private provider detail"));
    assert.deepEqual(serialized, { name: "Error" });
    assert.doesNotMatch(JSON.stringify(serialized), /private provider detail/);
  } finally {
    if (previous === undefined) delete process.env.LOG_ERROR_DETAILS;
    else process.env.LOG_ERROR_DETAILS = previous;
  }
});
