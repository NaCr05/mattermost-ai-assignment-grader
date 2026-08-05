import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../src/app";
import { hashPassword } from "../src/auth/password";
import { pool, prisma } from "../src/prisma";

type ApiResult = { response: Response; body: any };
type BrowserSession = { cookie: string; csrfToken: string };

function assertEvaluationContract(evaluation: any) {
  assert.equal(typeof evaluation.id, "string");
  assert.equal(typeof evaluation.submissionId, "string");
  assert.ok(["complete", "partial", "incomplete"].includes(evaluation.completenessLevel));
  assert.ok(["correct", "mostly_correct", "partially_correct", "incorrect", "uncertain"].includes(evaluation.correctnessLevel));
  assert.equal(typeof evaluation.completenessComment, "string");
  assert.equal(typeof evaluation.correctnessComment, "string");
  assert.ok(Array.isArray(evaluation.mainProblems));
  assert.ok(Array.isArray(evaluation.suggestions));
  assert.equal(typeof evaluation.score, "number");
  assert.match(evaluation.grade, /^[ABCDF]$/);
  assert.equal(typeof evaluation.version, "number");
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

test("TIDE grading API authenticated workflow", async (suite) => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const teacherPassword = "test-teacher-password-123";
  const studentPassword = "test-student-password-123";
  const otherTeacherPassword = "test-other-teacher-password-123";
  const [teacher, student, otherTeacher, revocationUser] = await Promise.all([
    prisma.user.create({
      data: {
        username: `teacher-${uniqueSuffix}`,
        displayName: "API Test Teacher",
        role: "teacher",
        passwordHash: await hashPassword(teacherPassword),
      },
    }),
    prisma.user.create({
      data: {
        username: `student-${uniqueSuffix}`,
        displayName: "API Test Student",
        role: "student",
        passwordHash: await hashPassword(studentPassword),
      },
    }),
    prisma.user.create({
      data: {
        username: `other-teacher-${uniqueSuffix}`,
        displayName: "Other API Teacher",
        role: "teacher",
        passwordHash: await hashPassword(otherTeacherPassword),
      },
    }),
    prisma.user.create({
      data: {
        username: `revoke-${uniqueSuffix}`,
        displayName: "Session Revocation User",
        role: "student",
        passwordHash: await hashPassword(studentPassword),
      },
    }),
  ]);
  const slashToken = process.env.MATTERMOST_SLASH_TOKEN ?? `slash-${uniqueSuffix}`;
  process.env.MATTERMOST_SLASH_TOKEN = slashToken;
  const app = createApp({ authSecret: `api-test-secret-${uniqueSuffix}-0123456789abcdef` });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const apiBase = `http://127.0.0.1:${address.port}`;
  let assignmentId: string | undefined;
  let submissionId: string | undefined;
  let evaluationId: string | undefined;

  async function request(path: string, init: RequestInit = {}, session?: BrowserSession): Promise<ApiResult> {
    const headers = new Headers(init.headers);
    if (session) {
      headers.set("cookie", session.cookie);
      if (!["GET", "HEAD", "OPTIONS"].includes(init.method ?? "GET")) {
        headers.set("x-csrf-token", session.csrfToken);
      }
    }
    const response = await fetch(`${apiBase}${path}`, { ...init, headers });
    return { response, body: await parseResponse(response) };
  }

  async function login(username: string, password: string): Promise<BrowserSession> {
    const result = await request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(result.response.status, 200);
    const cookie = result.response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    return { cookie, csrfToken: result.body.csrfToken };
  }

  const teacherSession = await login(teacher.username, teacherPassword);
  const studentSession = await login(student.username, studentPassword);
  const otherTeacherSession = await login(otherTeacher.username, otherTeacherPassword);
  const revocationSession = await login(revocationUser.username, studentPassword);

  try {
    await suite.test("health and session endpoints report configured authentication", async () => {
      const health = await request("/health");
      assert.equal(health.response.status, 200);
      assert.equal(health.body.authentication, "configured");
      assert.ok(health.response.headers.get("x-request-id"));
      const me = await request("/auth/me", {}, teacherSession);
      assert.equal(me.response.status, 200);
      assert.equal(me.body.user.id, teacher.id);
      assert.equal("passwordHash" in me.body.user, false);
    });

    await suite.test("protected mutations require a session and CSRF token", async () => {
      const anonymous = await request("/assignments");
      assert.equal(anonymous.response.status, 401);
      const missingCsrf = await request("/assignments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: teacherSession.cookie,
        },
        body: JSON.stringify({ title: "x" }),
      });
      assert.equal(missingCsrf.response.status, 403);
    });

    await suite.test("repeated login failures are rate limited without revealing accounts", async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 9; attempt += 1) {
        const result = await request("/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: `missing-${uniqueSuffix}`,
            password: "not-the-password",
          }),
        });
        statuses.push(result.response.status);
        if (attempt === 8) assert.ok(result.response.headers.get("retry-after"));
      }
      assert.deepEqual(statuses.slice(0, 8), Array(8).fill(401));
      assert.equal(statuses[8], 429);
    });

    await suite.test("identity is derived from the session", async () => {
      const studentPublish = await request("/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "student cannot publish",
          question: "permission test",
          deadline: "2027-07-26T15:59:00.000Z",
          createdById: teacher.id,
        }),
      }, studentSession);
      assert.equal(studentPublish.response.status, 403);

      const published = await request("/assignments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": `api-test-publish-${uniqueSuffix}`,
        },
        body: JSON.stringify({
          title: `API 验收测试 ${uniqueSuffix}`,
          question: "请说明栈的后进先出特性。",
          deadline: "2027-07-26T15:59:00.000Z",
          instructions: "该记录会在测试完成后自动清理。",
          createdById: otherTeacher.id,
        }),
      }, teacherSession);
      assert.equal(published.response.status, 201);
      assert.equal(published.body.createdById, teacher.id);
      assignmentId = published.body.id;
    });

    await suite.test("students can only submit as themselves", async () => {
      assert.ok(assignmentId);
      const teacherRejected = await request(`/assignments/${assignmentId}/submissions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer: "teacher answer", studentId: student.id }),
      }, teacherSession);
      assert.equal(teacherRejected.response.status, 403);

      const submitted = await request(`/assignments/${assignmentId}/submissions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: teacher.id,
          answer: "栈遵循后进先出，最后压入的元素最先弹出。",
        }),
      }, studentSession);
      assert.equal(submitted.response.status, 201);
      assert.equal(submitted.body.studentId, student.id);
      submissionId = submitted.body.id;
    });

    await suite.test("Agent evaluation and every read DTO redact internal output", async () => {
      assert.ok(submissionId);
      const evaluated = await request(`/submissions/${submissionId}/evaluate`, { method: "POST" }, studentSession);
      assert.equal(evaluated.response.status, 200);
      assertEvaluationContract(evaluated.body.evaluation);
      evaluationId = evaluated.body.evaluation.id;

      const reads = await Promise.all([
        request(`/submissions/${submissionId}`, {}, studentSession),
        request(`/submissions/${submissionId}/evaluation`, {}, studentSession),
        request(`/assignments/${assignmentId}/submissions`, {}, teacherSession),
        request(`/submissions/${submissionId}/evaluation-audits`, {}, teacherSession),
      ]);
      for (const result of reads) {
        assert.equal(result.response.status, 200);
        const serialized = JSON.stringify(result.body);
        assert.doesNotMatch(serialized, /agentRawOutput|errorMessage|raw_output/);
      }
    });

    await suite.test("teachers cannot manage another teacher's assignment", async () => {
      assert.ok(assignmentId);
      const summary = await request(`/assignments/${assignmentId}/submissions`, {}, otherTeacherSession);
      assert.equal(summary.response.status, 403);
      assert.ok(evaluationId);
      const confirm = await request(`/evaluations/${evaluationId}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }, otherTeacherSession);
      assert.equal(confirm.response.status, 403);
    });

    await suite.test("owner can regrade, modify with optimistic locking and confirm", async () => {
      assert.ok(evaluationId);
      const regraded = await request(`/evaluations/${evaluationId}/regrade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewedById: otherTeacher.id }),
      }, teacherSession);
      assert.equal(regraded.response.status, 200);
      const regradedVersion = regraded.body.evaluation.version;
      const modified = await request(`/evaluations/${evaluationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewedById: otherTeacher.id,
          expectedVersion: regradedVersion,
          score: 88,
          grade: "B",
          correctnessComment: "API 测试：教师已复核。",
        }),
      }, teacherSession);
      assert.equal(modified.response.status, 200);
      assert.equal(modified.body.reviewedById, teacher.id);
      const stale = await request(`/evaluations/${evaluationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: regradedVersion, score: 70 }),
      }, teacherSession);
      assert.equal(stale.response.status, 409);
      const confirmed = await request(`/evaluations/${evaluationId}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }, teacherSession);
      assert.equal(confirmed.response.status, 200);
      assert.equal(confirmed.body.status, "confirmed");
    });

    await suite.test("Mattermost keeps token, signed action and user mapping behavior", async () => {
      assert.ok(assignmentId);
      const mattermostUserId = `mm-${uniqueSuffix}`;
      const summary = await request("/mattermost/commands", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: slashToken,
          user_id: mattermostUserId,
          user_name: teacher.username,
          text: `summary | ${assignmentId}`,
        }),
      });
      assert.equal(summary.response.status, 200);
      const confirmAction = summary.body.attachments[0].actions.find(
        (action: { integration: { context: { action: string } } }) => action.integration.context.action === "confirm",
      );
      assert.match(confirmAction.integration.context.signature, /^[a-f0-9]{64}$/);
      const rejected = await request("/mattermost/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: mattermostUserId,
          user_name: teacher.username,
          context: { ...confirmAction.integration.context, signature: "0".repeat(64) },
        }),
      });
      assert.equal(rejected.response.status, 403);
      const confirmed = await request("/mattermost/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: mattermostUserId,
          user_name: teacher.username,
          context: confirmAction.integration.context,
        }),
      });
      assert.equal(confirmed.response.status, 200);
    });

    await suite.test("revoking sessions invalidates every previously issued cookie", async () => {
      const revoked = await request(
        "/auth/sessions/revoke",
        { method: "POST" },
        revocationSession,
      );
      assert.equal(revoked.response.status, 204);
      const staleSession = await request("/auth/me", {}, revocationSession);
      assert.equal(staleSession.response.status, 401);
    });
  } finally {
    if (assignmentId) await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.user.deleteMany({
      where: { id: { in: [teacher.id, student.id, otherTeacher.id, revocationUser.id] } },
    });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
    await pool.end();
  }
});
