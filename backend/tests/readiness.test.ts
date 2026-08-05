import assert from "node:assert/strict";
import test from "node:test";
import { createReadinessProbe } from "../src/health/readiness";

test("readiness requires both the database and Agent", async () => {
  const ready = createReadinessProbe({
    checkDatabase: async () => undefined,
    fetchImplementation: async () => new Response(null, { status: 200 }),
  });
  assert.deepEqual(await ready.check(), {
    status: "ready",
    database: "connected",
    agent: "connected",
  });

  const unavailable = createReadinessProbe({
    checkDatabase: async () => { throw new Error("database detail"); },
    fetchImplementation: async () => new Response(null, { status: 503 }),
  });
  assert.deepEqual(await unavailable.check(), {
    status: "not_ready",
    database: "unavailable",
    agent: "unavailable",
  });
});
