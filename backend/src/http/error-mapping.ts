import type express from "express";
import { GradingError } from "../grading/module";
import { logError } from "../logger";

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function sendServerError(
  response: express.Response,
  message: string,
  error: unknown,
) {
  const requestId = response.locals.requestId as string | undefined;
  logError("http.request.failed", error, { requestId, message });
  response.status(500).json({ message, requestId });
}

export function sendGradingError(response: express.Response, error: unknown) {
  if (!(error instanceof GradingError)) return false;
  const status = error.code === "forbidden" ? 403 : 409;
  response.status(status).json({
    message: error.message,
    requestId: response.locals.requestId,
  });
  return true;
}
