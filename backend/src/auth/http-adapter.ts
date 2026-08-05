import express from "express";
import type { prisma as defaultPrisma } from "../prisma";
import { hashPassword, verifyPassword } from "./password";
import {
  createDefaultAuthRateLimiters,
  type AuthRateLimiters,
  type RateLimitDecision,
} from "./rate-limit";
import type { SessionPayload, SessionService } from "./session";
import { isNonEmptyString, sendServerError } from "../http/error-mapping";
import { createAuthAdminRouter } from "./admin-routes";

type Database = typeof defaultPrisma;
type UserRole = "teacher" | "student";

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
};

type AuthLocals = {
  currentUser?: CurrentUser;
  session?: SessionPayload;
};

const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
} as const;

export function getCurrentUser(response: express.Response) {
  return (response.locals as AuthLocals).currentUser;
}

export function createAuthModule(input: {
  database: Database;
  sessions: SessionService;
  bootstrapToken?: string;
  rateLimiters?: AuthRateLimiters;
}) {
  const { database, sessions } = input;
  const rateLimiters = input.rateLimiters ?? createDefaultAuthRateLimiters();
  const router = express.Router();

  function clientKey(request: express.Request) {
    return request.ip || request.socket.remoteAddress || "unknown";
  }

  function rejectRateLimited(
    response: express.Response,
    decision: RateLimitDecision,
  ) {
    response.setHeader("retry-after", String(decision.retryAfterSeconds));
    return response.status(429).json({
      message: "Too many authentication attempts. Try again later.",
      retryAfterSeconds: decision.retryAfterSeconds,
    });
  }

  const requireSession: express.RequestHandler = async (
    request,
    response,
    next,
  ) => {
    try {
      if (!sessions.configured) {
        return response.status(503).json({ message: "Authentication is not configured" });
      }
      const session = sessions.verify(request.header("cookie"));
      if (!session) {
        return response.status(401).json({ message: "Authentication required" });
      }
      const user = await database.user.findUnique({
        where: { id: session.userId },
        select: { ...publicUserSelect, sessionVersion: true, disabledAt: true },
      });
      if (!user || user.disabledAt || user.sessionVersion !== session.sessionVersion) {
        sessions.clearCookie(response);
        return response.status(401).json({ message: "Authentication required" });
      }
      const {
        sessionVersion: _sessionVersion,
        disabledAt: _disabledAt,
        ...publicUser
      } = user;
      (response.locals as AuthLocals).currentUser = publicUser;
      (response.locals as AuthLocals).session = session;
      next();
    } catch (error) {
      sendServerError(response, "Failed to authenticate request", error);
    }
  };

  const requireCsrf: express.RequestHandler = (_request, response, next) => {
    const request = _request;
    const session = (response.locals as AuthLocals).session;
    const supplied = request.header("x-csrf-token");
    if (!session || !supplied || supplied !== session.csrfToken) {
      return response.status(403).json({ message: "CSRF token is missing or invalid" });
    }
    next();
  };

  function requireRole(role: UserRole): express.RequestHandler {
    return (_request, response, next) => {
      if (getCurrentUser(response)?.role !== role) {
        return response.status(403).json({ message: `${role} role required` });
      }
      next();
    };
  }

  router.post("/bootstrap", async (request, response) => {
    try {
      const rateLimit = rateLimiters.bootstrapByIp.consume(clientKey(request));
      if (!rateLimit.allowed) return rejectRateLimited(response, rateLimit);
      if (!sessions.configured) {
        return response.status(503).json({ message: "Authentication is not configured" });
      }
      const configuredToken = input.bootstrapToken?.trim();
      if (!configuredToken || request.header("x-bootstrap-token") !== configuredToken) {
        return response.status(403).json({ message: "Bootstrap token is invalid" });
      }
      const credentialedUsers = await database.user.count({
        where: { passwordHash: { not: null } },
      });
      if (credentialedUsers > 0) {
        return response.status(409).json({ message: "Platform is already bootstrapped" });
      }
      const { username, displayName, password } = request.body;
      if (
        !isNonEmptyString(username) ||
        !isNonEmptyString(displayName) ||
        !isNonEmptyString(password) ||
        password.length < 12
      ) {
        return response.status(400).json({
          message: "username, displayName and a password of at least 12 characters are required",
        });
      }
      const passwordHash = await hashPassword(password);
      const user = await database.$transaction(async (transaction) => {
        const created = await transaction.user.upsert({
          where: { username: username.trim() },
          update: { displayName: displayName.trim(), role: "teacher", passwordHash },
          create: {
            username: username.trim(),
            displayName: displayName.trim(),
            role: "teacher",
            passwordHash,
          },
          select: publicUserSelect,
        });
        await transaction.authAudit.create({
          data: { action: "bootstrap_completed", targetUserId: created.id },
        });
        return created;
      });
      response.status(201).json(user);
    } catch (error) {
      sendServerError(response, "Failed to bootstrap platform", error);
    }
  });

  router.post("/login", async (request, response) => {
    try {
      if (!sessions.configured) {
        return response.status(503).json({ message: "Authentication is not configured" });
      }
      const { username, password } = request.body;
      if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
        return response.status(400).json({ message: "username and password are required" });
      }
      const accountKey = username.trim().toLowerCase();
      const ipLimit = rateLimiters.loginByIp.consume(clientKey(request));
      const accountLimit = rateLimiters.loginByAccount.consume(accountKey);
      if (!ipLimit.allowed || !accountLimit.allowed) {
        return rejectRateLimited(
          response,
          ipLimit.allowed ? accountLimit : ipLimit,
        );
      }
      const user = await database.user.findUnique({ where: { username: username.trim() } });
      const passwordMatches = user?.passwordHash
        ? await verifyPassword(password, user.passwordHash)
        : false;
      if (!user || !passwordMatches || user.disabledAt) {
        await database.authAudit.create({
          data: { action: "login_failed", targetUserId: user?.id },
        });
        return response.status(401).json({ message: "Invalid username or password" });
      }
      rateLimiters.loginByAccount.reset(accountKey);
      await database.authAudit.create({
        data: { action: "login_succeeded", targetUserId: user.id },
      });
      const session = sessions.issue(user.id, user.sessionVersion);
      sessions.setCookie(response, session.cookieValue);
      response.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
        csrfToken: session.payload.csrfToken,
      });
    } catch (error) {
      sendServerError(response, "Failed to sign in", error);
    }
  });

  router.get("/me", requireSession, (_request, response) => {
    response.json({
      user: getCurrentUser(response),
      csrfToken: (response.locals as AuthLocals).session?.csrfToken,
    });
  });

  router.post("/logout", requireSession, requireCsrf, (_request, response) => {
    sessions.clearCookie(response);
    response.status(204).end();
  });

  router.post(
    "/sessions/revoke",
    requireSession,
    requireCsrf,
    async (_request, response) => {
      try {
        const currentUser = getCurrentUser(response);
        const session = (response.locals as AuthLocals).session;
        if (!currentUser || !session) {
          return response.status(401).json({ message: "Authentication required" });
        }
        await database.$transaction(async (transaction) => {
          await transaction.user.updateMany({
            where: {
              id: currentUser.id,
              sessionVersion: session.sessionVersion,
            },
            data: { sessionVersion: { increment: 1 } },
          });
          await transaction.authAudit.create({
            data: {
              action: "sessions_revoked",
              actorId: currentUser.id,
              targetUserId: currentUser.id,
            },
          });
        });
        sessions.clearCookie(response);
        response.status(204).end();
      } catch (error) {
        sendServerError(response, "Failed to revoke sessions", error);
      }
    },
  );

  router.use("/users", createAuthAdminRouter({
    database,
    requireSession,
    requireCsrf,
    requireTeacher: requireRole("teacher"),
    currentUser: getCurrentUser,
  }));

  return { router, requireSession, requireCsrf, requireRole };
}
