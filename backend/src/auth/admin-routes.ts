import express from "express";
import { isNonEmptyString, sendServerError } from "../http/error-mapping";
import type { prisma as defaultPrisma } from "../prisma";
import type { CurrentUser } from "./http-adapter";
import { hashPassword } from "./password";

type Database = typeof defaultPrisma;

const managedUserSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  disabledAt: true,
  createdAt: true,
} as const;

function toManagedUserDto(user: {
  id: string;
  username: string;
  displayName: string;
  role: "teacher" | "student";
  disabledAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    disabled: user.disabledAt !== null,
    createdAt: user.createdAt,
  };
}

export function createAuthAdminRouter(input: {
  database: Database;
  requireSession: express.RequestHandler;
  requireCsrf: express.RequestHandler;
  requireTeacher: express.RequestHandler;
  currentUser(response: express.Response): CurrentUser | undefined;
}) {
  const router = express.Router();
  router.use(input.requireSession, input.requireTeacher);

  router.get("/", async (_request, response) => {
    try {
      const users = await input.database.user.findMany({
        select: managedUserSelect,
        orderBy: [{ disabledAt: "asc" }, { displayName: "asc" }],
      });
      response.json(users.map(toManagedUserDto));
    } catch (error) {
      sendServerError(response, "Failed to list users", error);
    }
  });

  router.post("/", input.requireCsrf, async (request, response) => {
    try {
      const actor = input.currentUser(response);
      const { username, displayName, password, role } = request.body;
      if (
        !actor ||
        !isNonEmptyString(username) ||
        !isNonEmptyString(displayName) ||
        !isNonEmptyString(password) ||
        password.length < 12 ||
        (role !== "teacher" && role !== "student")
      ) {
        return response.status(400).json({
          message: "username, displayName, role and a password of at least 12 characters are required",
        });
      }
      const existing = await input.database.user.findUnique({ where: { username: username.trim() } });
      if (existing) return response.status(409).json({ message: "Username already exists" });
      const passwordHash = await hashPassword(password);
      const user = await input.database.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            username: username.trim(),
            displayName: displayName.trim(),
            role,
            passwordHash,
          },
          select: managedUserSelect,
        });
        await transaction.authAudit.create({
          data: { action: "user_created", actorId: actor.id, targetUserId: created.id },
        });
        return created;
      });
      response.status(201).json(toManagedUserDto(user));
    } catch (error) {
      sendServerError(response, "Failed to create user", error);
    }
  });

  router.post("/:userId/password-reset", input.requireCsrf, async (request, response) => {
    try {
      const actor = input.currentUser(response);
      const { password } = request.body;
      const userId = Array.isArray(request.params.userId)
        ? request.params.userId[0]
        : request.params.userId;
      if (!actor || !isNonEmptyString(userId) || !isNonEmptyString(password) || password.length < 12) {
        return response.status(400).json({ message: "A password of at least 12 characters is required" });
      }
      const target = await input.database.user.findUnique({ where: { id: userId } });
      if (!target) return response.status(404).json({ message: "User not found" });
      const passwordHash = await hashPassword(password);
      await input.database.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: target.id },
          data: {
            passwordHash,
            sessionVersion: { increment: 1 },
          },
        });
        await transaction.authAudit.create({
          data: { action: "password_reset", actorId: actor.id, targetUserId: target.id },
        });
      });
      response.status(204).end();
    } catch (error) {
      sendServerError(response, "Failed to reset password", error);
    }
  });

  router.patch("/:userId/status", input.requireCsrf, async (request, response) => {
    try {
      const actor = input.currentUser(response);
      const disabled = request.body?.disabled;
      const userId = Array.isArray(request.params.userId)
        ? request.params.userId[0]
        : request.params.userId;
      if (!actor || !isNonEmptyString(userId) || typeof disabled !== "boolean") {
        return response.status(400).json({ message: "disabled must be a boolean" });
      }
      if (disabled && userId === actor.id) {
        return response.status(409).json({ message: "You cannot disable your own account" });
      }
      const target = await input.database.user.findUnique({ where: { id: userId } });
      if (!target) return response.status(404).json({ message: "User not found" });
      if ((target.disabledAt !== null) === disabled) {
        const unchanged = await input.database.user.findUniqueOrThrow({
          where: { id: target.id },
          select: managedUserSelect,
        });
        return response.json(toManagedUserDto(unchanged));
      }
      const updated = await input.database.$transaction(async (transaction) => {
        const saved = await transaction.user.update({
          where: { id: target.id },
          data: {
            disabledAt: disabled ? new Date() : null,
            sessionVersion: { increment: 1 },
          },
          select: managedUserSelect,
        });
        await transaction.authAudit.create({
          data: {
            action: disabled ? "account_disabled" : "account_enabled",
            actorId: actor.id,
            targetUserId: target.id,
          },
        });
        return saved;
      });
      response.json(toManagedUserDto(updated));
    } catch (error) {
      sendServerError(response, "Failed to update account status", error);
    }
  });

  return router;
}
