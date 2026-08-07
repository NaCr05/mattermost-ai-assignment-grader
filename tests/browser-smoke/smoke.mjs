import { chromium } from "playwright";
import {
  assignments,
  auditResponse,
  studentSession,
  submissionSummary,
  teacherSession,
} from "./fixture.mjs";

const frontendUrl = process.env.FRONTEND_URL ?? "http://frontend:5173";
const browser = await chromium.launch({ headless: true });

function captureBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function assertPageMetadata(page) {
  const metadata = await page.evaluate(() => ({
    language: document.documentElement.lang,
    title: document.title,
    description: document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content"),
  }));
  if (
    metadata.language !== "zh-CN" ||
    metadata.title !== "TIDE 作业评估平台" ||
    metadata.description !== "面向教师复核流程的 AI 辅助作业评估与管理平台。"
  ) {
    throw new Error(`Unexpected HTML metadata: ${JSON.stringify(metadata)}.`);
  }
}

async function openPage(page) {
  const response = await page.goto(frontendUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (!response?.ok()) {
    throw new Error(`Frontend returned HTTP ${response?.status() ?? "unknown"}.`);
  }
  await page.waitForFunction(
    () => (document.querySelector("#root")?.childElementCount ?? 0) > 0,
    undefined,
    { timeout: 15_000 },
  );
}

try {
  const studentPage = await browser.newPage();
  const studentErrors = captureBrowserErrors(studentPage);
  await studentPage.route("**/auth/me", (route) =>
    fulfillJson(route, studentSession));
  await openPage(studentPage);
  await studentPage.getByRole("heading", { name: "学生账号已登录" }).waitFor();
  await assertPageMetadata(studentPage);
  if (studentErrors.length > 0) {
    throw new Error(`Student browser errors: ${studentErrors.join(" | ")}`);
  }
  await studentPage.close();

  const teacherPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const teacherErrors = captureBrowserErrors(teacherPage);
  await teacherPage.route("**/auth/me", (route) =>
    fulfillJson(route, teacherSession));
  await teacherPage.route("**/assignments", (route) =>
    fulfillJson(route, assignments));
  await teacherPage.route("**/assignments/*/submissions", (route) =>
    fulfillJson(route, submissionSummary));
  await teacherPage.route("**/submissions/*/evaluation-audits", (route) =>
    fulfillJson(route, auditResponse));

  await openPage(teacherPage);
  await teacherPage.getByRole("heading", { name: "作业评估工作台" }).waitFor();
  await teacherPage.getByText("匿名学生 A", { exact: true }).waitFor();
  await teacherPage.getByRole("button", { name: "查看评估历史" }).first().click();
  await teacherPage.getByRole("heading", { name: "评估审计时间线" }).waitFor();
  await assertPageMetadata(teacherPage);
  if (teacherErrors.length > 0) {
    throw new Error(`Teacher browser errors: ${teacherErrors.join(" | ")}`);
  }

  console.log("Browser smoke passed: student route, teacher workspace, and evaluation audit.");
} finally {
  await browser.close();
}
