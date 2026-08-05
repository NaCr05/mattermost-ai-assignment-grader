ALTER TABLE "Evaluation"
  ADD COLUMN "agentProvider" VARCHAR(50),
  ADD COLUMN "agentRequestId" VARCHAR(128),
  ADD COLUMN "agentAttempts" INTEGER,
  ADD COLUMN "modelName" VARCHAR(200),
  ADD COLUMN "promptVersion" VARCHAR(100),
  ADD COLUMN "agentDurationMs" DOUBLE PRECISION,
  ADD COLUMN "inputTokens" INTEGER,
  ADD COLUMN "outputTokens" INTEGER,
  ADD COLUMN "totalTokens" INTEGER,
  ADD COLUMN "estimatedCostUsd" DECIMAL(16,8);
