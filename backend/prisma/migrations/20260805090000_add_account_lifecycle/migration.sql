CREATE TYPE "AuthAuditAction" AS ENUM (
  'bootstrap_completed',
  'login_succeeded',
  'login_failed',
  'user_created',
  'password_reset',
  'account_disabled',
  'account_enabled',
  'sessions_revoked'
);

ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

CREATE TABLE "AuthAudit" (
  "id" TEXT NOT NULL,
  "action" "AuthAuditAction" NOT NULL,
  "actorId" TEXT,
  "targetUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthAudit_actorId_createdAt_idx" ON "AuthAudit"("actorId", "createdAt");
CREATE INDEX "AuthAudit_targetUserId_createdAt_idx" ON "AuthAudit"("targetUserId", "createdAt");
CREATE INDEX "AuthAudit_action_createdAt_idx" ON "AuthAudit"("action", "createdAt");

ALTER TABLE "AuthAudit"
  ADD CONSTRAINT "AuthAudit_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuthAudit"
  ADD CONSTRAINT "AuthAudit_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
