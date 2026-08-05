export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type RateLimiter = {
  consume(key: string): RateLimitDecision;
  reset(key: string): void;
};

type RateLimiterOptions = {
  limit: number;
  windowMilliseconds: number;
  maxKeys?: number;
  now?: () => number;
};

type Bucket = {
  attempts: number;
  resetAt: number;
};

export function createFixedWindowRateLimiter(
  options: RateLimiterOptions,
): RateLimiter {
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error("Rate limit must be a positive integer.");
  }
  if (!Number.isFinite(options.windowMilliseconds) || options.windowMilliseconds < 1) {
    throw new Error("Rate-limit window must be positive.");
  }

  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 10_000;
  const buckets = new Map<string, Bucket>();

  function removeExpired(timestamp: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) buckets.delete(key);
    }
  }

  function reserveCapacity(timestamp: number) {
    if (buckets.size < maxKeys) return;
    removeExpired(timestamp);
    if (buckets.size < maxKeys) return;
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (oldestKey) buckets.delete(oldestKey);
  }

  return {
    consume(rawKey) {
      const key = rawKey.trim() || "unknown";
      const timestamp = now();
      let bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= timestamp) {
        if (!bucket) reserveCapacity(timestamp);
        bucket = {
          attempts: 0,
          resetAt: timestamp + options.windowMilliseconds,
        };
        buckets.set(key, bucket);
      }

      bucket.attempts += 1;
      if (bucket.attempts <= options.limit) {
        return { allowed: true, retryAfterSeconds: 0 };
      }

      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000)),
      };
    },
    reset(rawKey) {
      buckets.delete(rawKey.trim() || "unknown");
    },
  };
}

export type AuthRateLimiters = {
  loginByIp: RateLimiter;
  loginByAccount: RateLimiter;
  bootstrapByIp: RateLimiter;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createDefaultAuthRateLimiters(
  environment: NodeJS.ProcessEnv = process.env,
): AuthRateLimiters {
  const windowMilliseconds =
    positiveInteger(environment.AUTH_RATE_LIMIT_WINDOW_SECONDS, 15 * 60) * 1000;

  return {
    loginByIp: createFixedWindowRateLimiter({
      limit: positiveInteger(environment.AUTH_LOGIN_IP_LIMIT, 30),
      windowMilliseconds,
    }),
    loginByAccount: createFixedWindowRateLimiter({
      limit: positiveInteger(environment.AUTH_LOGIN_ACCOUNT_LIMIT, 8),
      windowMilliseconds,
    }),
    bootstrapByIp: createFixedWindowRateLimiter({
      limit: positiveInteger(environment.AUTH_BOOTSTRAP_IP_LIMIT, 5),
      windowMilliseconds,
    }),
  };
}
