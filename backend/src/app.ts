import cors from "cors";
import { randomUUID } from "node:crypto";
import express from "express";
import { createAuthModule, getCurrentUser } from "./auth/http-adapter";
import {
  createDefaultAuthRateLimiters,
  type AuthRateLimiters,
} from "./auth/rate-limit";
import { createSessionService } from "./auth/session";
import { createGradingModule } from "./grading/module";
import { createAssignmentsRouter } from "./http/assignments-routes";
import { createEvaluationsRouter } from "./http/evaluations-routes";
import { isNonEmptyString, sendServerError } from "./http/error-mapping";
import { createSubmissionsRouter } from "./http/submissions-routes";
import { logInfo } from "./logger";
import { createMattermostModule } from "./mattermost/module";
import { prisma as defaultPrisma } from "./prisma";

type AppDependencies = {
  database?: typeof defaultPrisma;
  grading?: ReturnType<typeof createGradingModule>;
  authSecret?: string;
  authCookieSecure?: boolean;
  bootstrapToken?: string;
  authRateLimiters?: AuthRateLimiters;
  trustProxy?: boolean | number | string;
};

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value || value.toLowerCase() === "false" || value === "0") return false;
  if (value.toLowerCase() === "true") return true;
  const hops = Number(value);
  return Number.isInteger(hops) && hops > 0 ? hops : value;
}

export function createApp(dependencies: AppDependencies = {}) {
  const database = dependencies.database ?? defaultPrisma;
  const grading = dependencies.grading ?? createGradingModule({ database });
  const sessions = createSessionService({
    secret: dependencies.authSecret ?? process.env.AUTH_SECRET,
    secure:
      dependencies.authCookieSecure ??
      process.env.AUTH_COOKIE_SECURE?.toLowerCase() === "true",
  });
  const auth = createAuthModule({
    database,
    sessions,
    bootstrapToken: dependencies.bootstrapToken ?? process.env.BOOTSTRAP_TOKEN,
    rateLimiters:
      dependencies.authRateLimiters ?? createDefaultAuthRateLimiters(),
  });
  const app = express();
  app.set(
    "trust proxy",
    dependencies.trustProxy ?? parseTrustProxy(process.env.TRUST_PROXY),
  );
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use((request, response, next) => {
    const incomingRequestId = request.header("x-request-id");
    const requestId = isNonEmptyString(incomingRequestId) ? incomingRequestId : randomUUID();
    const requestPath = request.originalUrl.split("?")[0] || request.path;
    const startedAt = performance.now();
    response.locals.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    response.on("finish", () => {
      const shouldLogHealth = process.env.LOG_HEALTH_REQUESTS?.toLowerCase() === "true";
      if ((requestPath === "/health" || requestPath === "/metrics") && !shouldLogHealth) return;
      logInfo("http.request.completed", {
        requestId,
        method: request.method,
        path: requestPath,
        statusCode: response.statusCode,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        remoteAddress: request.ip,
      });
    });
    next();
  });

  app.get("/health", async (_request, response) => {
    try {
      await database.$queryRaw`SELECT 1`;
      response.json({
        status: "ok",
        database: "connected",
        authentication: sessions.configured ? "configured" : "not_configured",
      });
    } catch (error) {
      sendServerError(response, "Database health check failed", error);
    }
  });

  app.use("/auth", auth.router);
  app.use("/mattermost", createMattermostModule({
    database,
    grading,
    slashToken: process.env.MATTERMOST_SLASH_TOKEN,
    teacherUsername: process.env.MATTERMOST_TEACHER_USERNAME,
    actionUrl: process.env.MATTERMOST_ACTION_URL,
  }));

  app.use(auth.requireSession);
  app.use((request, response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    return auth.requireCsrf(request, response, next);
  });
  app.use("/assignments", createAssignmentsRouter({ database, currentUser: getCurrentUser }));
  app.use(createSubmissionsRouter({ database, grading, currentUser: getCurrentUser }));
  app.use(
    "/evaluations",
    auth.requireRole("teacher"),
    createEvaluationsRouter({ grading, currentUser: getCurrentUser }),
  );

  app.use((_request, response) => {
    response.status(404).json({ message: "Route not found" });
  });

  return app;
}

export const app = createApp();
