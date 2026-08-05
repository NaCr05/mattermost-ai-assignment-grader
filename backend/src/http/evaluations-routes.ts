import express from "express";
import type { CurrentUser } from "../auth/http-adapter";
import type { createGradingModule, EvaluationChanges } from "../grading/module";
import { toEvaluationDto } from "../grading/dto";
import { logError } from "../logger";
import { isNonEmptyString, sendGradingError, sendServerError } from "./error-mapping";

type GradingModule = ReturnType<typeof createGradingModule>;

export function createEvaluationsRouter(input: {
  grading: GradingModule;
  currentUser(response: express.Response): CurrentUser | undefined;
}) {
  const router = express.Router();

  router.post("/:id/confirm", async (request, response) => {
    try {
      const result = await input.grading.reviewEvaluation({
        kind: "confirm",
        evaluationId: request.params.id,
        actorId: input.currentUser(response)!.id,
      });
      if (!result) return response.status(404).json({ message: "Evaluation not found" });
      response.json(toEvaluationDto(result.evaluation));
    } catch (error) {
      if (sendGradingError(response, error)) return;
      sendServerError(response, "Failed to confirm evaluation", error);
    }
  });

  router.patch("/:id", async (request, response) => {
    try {
      const {
        score,
        grade,
        completenessComment,
        correctnessComment,
        mainProblems,
        suggestions,
        expectedVersion,
      } = request.body;
      const hasEditableField =
        score !== undefined || grade !== undefined || completenessComment !== undefined ||
        correctnessComment !== undefined || mainProblems !== undefined || suggestions !== undefined;
      if (!hasEditableField) {
        return response.status(400).json({ message: "At least one editable evaluation field is required" });
      }
      if (score !== undefined && (!Number.isInteger(score) || score < 0 || score > 100)) {
        return response.status(400).json({ message: "score must be an integer between 0 and 100" });
      }
      const grades = ["A", "B", "C", "D", "F"] as const;
      if (grade !== undefined && !grades.includes(grade)) {
        return response.status(400).json({ message: "grade must be A, B, C, D or F" });
      }
      if (completenessComment !== undefined && !isNonEmptyString(completenessComment)) {
        return response.status(400).json({ message: "completenessComment must be a non-empty string" });
      }
      if (correctnessComment !== undefined && !isNonEmptyString(correctnessComment)) {
        return response.status(400).json({ message: "correctnessComment must be a non-empty string" });
      }
      const validTextList = (value: unknown) =>
        Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
      if (mainProblems !== undefined && !validTextList(mainProblems)) {
        return response.status(400).json({ message: "mainProblems must be a non-empty string array" });
      }
      if (suggestions !== undefined && !validTextList(suggestions)) {
        return response.status(400).json({ message: "suggestions must be a non-empty string array" });
      }
      if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
        return response.status(400).json({ message: "expectedVersion must be a positive integer" });
      }
      const changes: EvaluationChanges = {
        ...(score !== undefined ? { score } : {}),
        ...(grade !== undefined ? { grade } : {}),
        ...(completenessComment !== undefined ? { completenessComment } : {}),
        ...(correctnessComment !== undefined ? { correctnessComment } : {}),
        ...(mainProblems !== undefined ? { mainProblems } : {}),
        ...(suggestions !== undefined ? { suggestions } : {}),
      };
      const result = await input.grading.reviewEvaluation({
        kind: "modify",
        evaluationId: request.params.id,
        actorId: input.currentUser(response)!.id,
        expectedVersion,
        changes,
      });
      if (!result) return response.status(404).json({ message: "Evaluation not found" });
      response.json(toEvaluationDto(result.evaluation));
    } catch (error) {
      if (sendGradingError(response, error)) return;
      sendServerError(response, "Failed to modify evaluation", error);
    }
  });

  router.post("/:id/regrade", async (request, response) => {
    try {
      const result = await input.grading.reviewEvaluation({
        kind: "regrade",
        evaluationId: request.params.id,
        actorId: input.currentUser(response)!.id,
      });
      if (!result) return response.status(404).json({ message: "Evaluation not found" });
      response.json({ evaluation: toEvaluationDto(result.evaluation), agent: result.agent });
    } catch (error) {
      if (sendGradingError(response, error)) return;
      logError("evaluation.regrade_http_request_failed", error, {
        requestId: response.locals.requestId,
        evaluationId: request.params.id,
      });
      response.status(502).json({
        message: "Failed to regrade evaluation",
        requestId: response.locals.requestId,
      });
    }
  });

  return router;
}
