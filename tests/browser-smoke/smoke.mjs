import { chromium } from "playwright";

const frontendUrl = process.env.FRONTEND_URL ?? "http://frontend:5173";
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const browserErrors = [];

  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.route("**/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "browser-smoke-student",
          username: "browser-smoke",
          displayName: "Browser Smoke",
          role: "student",
        },
        csrfToken: "browser-smoke-csrf-token",
      }),
    });
  });

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

  const heading = (await page.locator("h1").first().textContent())?.trim();
  const expectedHeadings = new Set([
    "登录作业评估平台",
    "作业评估工作台",
    "学生账号已登录",
  ]);

  if (!heading || !expectedHeadings.has(heading)) {
    throw new Error(`Unexpected application heading: ${heading ?? "missing"}.`);
  }

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

  if (browserErrors.length > 0) {
    throw new Error(`Browser errors: ${browserErrors.join(" | ")}`);
  }

  console.log(`Browser smoke passed: ${heading}`);
} finally {
  await browser.close();
}
