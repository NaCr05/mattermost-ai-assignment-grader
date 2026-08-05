import assert from "node:assert/strict";
import test from "node:test";
import { createFixedWindowRateLimiter } from "../src/auth/rate-limit";

test("authentication rate limiter blocks until its window expires", () => {
  let timestamp = 1_000;
  const limiter = createFixedWindowRateLimiter({
    limit: 2,
    windowMilliseconds: 10_000,
    now: () => timestamp,
  });

  assert.equal(limiter.consume("account").allowed, true);
  assert.equal(limiter.consume("account").allowed, true);
  const blocked = limiter.consume("account");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 10);

  timestamp += 10_000;
  assert.equal(limiter.consume("account").allowed, true);
});

test("successful authentication can reset the account bucket", () => {
  const limiter = createFixedWindowRateLimiter({
    limit: 1,
    windowMilliseconds: 10_000,
  });
  assert.equal(limiter.consume("account").allowed, true);
  assert.equal(limiter.consume("account").allowed, false);
  limiter.reset("account");
  assert.equal(limiter.consume("account").allowed, true);
});
