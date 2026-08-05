import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/auth/password";
import { SESSION_COOKIE, createSessionService } from "../src/auth/session";

test("password hashes are salted and verifiable", async () => {
  const first = await hashPassword("a sufficiently long password");
  const second = await hashPassword("a sufficiently long password");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a sufficiently long password", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
});

test("signed sessions reject tampering and expose a CSRF token", () => {
  const sessions = createSessionService({
    secret: "unit-test-auth-secret-0123456789abcdef",
    ttlMilliseconds: 60_000,
  });
  const issued = sessions.issue("user-1", 3);
  const verified = sessions.verify(`${SESSION_COOKIE}=${issued.cookieValue}`);
  assert.equal(verified?.userId, "user-1");
  assert.equal(verified?.sessionVersion, 3);
  assert.ok(verified?.csrfToken);

  const tampered = `${issued.cookieValue.slice(0, -1)}x`;
  assert.equal(sessions.verify(`${SESSION_COOKIE}=${tampered}`), null);
});

test("authentication fails closed when AUTH_SECRET is missing or short", () => {
  const sessions = createSessionService({ secret: "short" });
  assert.equal(sessions.configured, false);
  assert.equal(sessions.verify(`${SESSION_COOKIE}=anything`), null);
  assert.throws(() => sessions.issue("user-1", 0), /at least 32 characters/);
});
