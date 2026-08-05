import express from "express";
import type { createGradingModule } from "../grading/module";
import { logError, logInfo, logWarn } from "../logger";
import type { prisma as defaultPrisma } from "../prisma";
import { isNonEmptyString } from "../http/error-mapping";
import { parseMattermostCommand, parseMattermostDeadline } from "./command-parser";
import { buildMattermostEvaluationAttachment, mattermostReply } from "./message-format";
import type { MattermostSigner } from "./signing";

type Database = typeof defaultPrisma;
type GradingModule = ReturnType<typeof createGradingModule>;

export function createMattermostRouter(input: {
  database: Database;
  grading: GradingModule;
  slashToken?: string;
  teacherUsername?: string;
  actionUrl?: string;
  signer: MattermostSigner;
}) {
  const router = express.Router();

  async function findUser(mattermostUserId: string, username: string) {
    let user = await input.database.user.findFirst({
      where: { disabledAt: null, OR: [{ mattermostUserId }, { username }] },
    });
    if (!user && username === input.teacherUsername) {
      user = await input.database.user.findFirst({
        where: { role: "teacher", passwordHash: { not: null }, disabledAt: null },
        orderBy: { createdAt: "asc" },
      });
    }
    return user;
  }

  router.post("/commands", async (request, response) => {
    try {
      const { token, user_id: mattermostUserId, user_name: username, text } = request.body;
      if (!input.slashToken) {
        return response.status(503).json(mattermostReply("后端尚未配置 MATTERMOST_SLASH_TOKEN。"));
      }
      if (token !== input.slashToken) {
        return response.status(403).json(mattermostReply("Slash Command Token 无效。"));
      }
      if (!isNonEmptyString(mattermostUserId) || !isNonEmptyString(username)) {
        return response.status(400).json(mattermostReply("缺少 Mattermost 用户信息。"));
      }
      const user = await findUser(mattermostUserId, username);
      if (!user) {
        return response.json(mattermostReply(`未找到系统用户 @${username}，请联系平台管理员配置账号映射。`));
      }
      if (!user.mattermostUserId) {
        await input.database.user.update({ where: { id: user.id }, data: { mattermostUserId } });
      }
      const { parts, command } = parseMattermostCommand(text);
      logInfo("mattermost.command_received", {
        requestId: response.locals.requestId,
        command: command || "help",
        mattermostUserId,
        username,
        systemUserId: user.id,
        role: user.role,
      });

      if (!command || command === "help") {
        return response.json(mattermostReply([
          "### 数据结构作业助手",
          "教师发布：`/ds publish | 标题 | 2026-07-25 23:59 | 题目内容 | 其他说明`",
          "学生提交：`/ds submit | assignment_id | 答案内容`",
          "教师汇总：`/ds summary | assignment_id`",
        ].join("\n")));
      }

      if (command === "publish") {
        if (user.role !== "teacher") return response.json(mattermostReply("只有教师账号可以发布作业。"));
        const [, title, deadlineText, question, instructions] = parts;
        if (!title || !deadlineText || !question) {
          return response.json(mattermostReply("格式错误：`/ds publish | 标题 | 截止时间 | 题目内容 | 其他说明`"));
        }
        const deadline = parseMattermostDeadline(deadlineText);
        if (Number.isNaN(deadline.getTime())) return response.json(mattermostReply("截止时间格式无效。"));
        const assignment = await input.database.assignment.create({
          data: { title, question, deadline, instructions: instructions || null, createdById: user.id },
        });
        return response.json(mattermostReply([
          `### 作业已发布：${assignment.title}`,
          `- 作业 ID：\`${assignment.id}\``,
          `- 截止时间：${assignment.deadline.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
          `- 题目：${assignment.question}`,
        ].join("\n"), true));
      }

      if (command === "submit") {
        if (user.role !== "student") return response.json(mattermostReply("只有学生账号可以提交答案。"));
        const [, assignmentId, ...answerParts] = parts;
        const answer = answerParts.join(" | ").trim();
        if (!assignmentId || !answer) {
          return response.json(mattermostReply("格式错误：`/ds submit | assignment_id | 答案内容`"));
        }
        const assignment = await input.database.assignment.findUnique({ where: { id: assignmentId } });
        if (!assignment) return response.json(mattermostReply("未找到对应作业。"));
        if (assignment.status !== "published") return response.json(mattermostReply("该作业已经关闭。"));
        const existing = await input.database.submission.findUnique({
          where: { assignmentId_studentId: { assignmentId, studentId: user.id } },
        });
        const submission = await input.database.$transaction(async (transaction) => {
          if (existing) {
            await transaction.evaluation.deleteMany({ where: { submissionId: existing.id } });
            return transaction.submission.update({
              where: { id: existing.id },
              data: { answer, status: "submitted", submittedAt: new Date() },
            });
          }
          return transaction.submission.create({ data: { assignmentId, studentId: user.id, answer } });
        });
        try {
          const result = await input.grading.evaluateSubmission({ submissionId: submission.id, actorId: user.id });
          const evaluation = result?.evaluation;
          return response.json(mattermostReply([
            `答案已提交：**${assignment.title}**`,
            `提交 ID：\`${submission.id}\``,
            evaluation
              ? `AI 基础评估已生成：**${evaluation.score} 分 / ${evaluation.grade}**（等待教师审核）`
              : "AI 基础评估尚未生成。",
          ].join("\n")));
        } catch (error) {
          logError("mattermost.submission_evaluation_failed", error, {
            requestId: response.locals.requestId,
            submissionId: submission.id,
            assignmentId: assignment.id,
            userId: user.id,
          });
          return response.json(mattermostReply([
            `答案已提交：**${assignment.title}**`,
            `提交 ID：\`${submission.id}\``,
            "AI 评估暂时失败，教师可在审核页面重新评估。",
          ].join("\n")));
        }
      }

      if (command === "summary") {
        if (user.role !== "teacher") return response.json(mattermostReply("只有教师账号可以查看汇总。"));
        const assignmentId = parts[1];
        if (!assignmentId) return response.json(mattermostReply("格式错误：`/ds summary | assignment_id`"));
        const assignment = await input.database.assignment.findUnique({
          where: { id: assignmentId },
          include: {
            submissions: {
              include: { student: true, evaluation: true },
              orderBy: { submittedAt: "asc" },
            },
          },
        });
        if (!assignment) return response.json(mattermostReply("未找到对应作业。"));
        if (assignment.createdById !== user.id) return response.json(mattermostReply("你无权查看其他教师的作业汇总。"));
        const rows = assignment.submissions.map((submission) => {
          const result = submission.evaluation
            ? `${submission.evaluation.score} 分 / ${submission.evaluation.grade} / ${submission.evaluation.status}`
            : "尚未评估";
          const preview = submission.answer.length > 80 ? `${submission.answer.slice(0, 80)}…` : submission.answer;
          return `- **${submission.student.displayName}**：${result}\n  > ${preview}`;
        });
        const attachments = assignment.submissions.flatMap((submission) =>
          submission.evaluation ? [buildMattermostEvaluationAttachment(request, {
            submissionId: submission.id,
            studentName: submission.student.displayName,
            answer: submission.answer,
            evaluation: submission.evaluation,
          }, input.signer, input.actionUrl)] : [],
        );
        return response.json(mattermostReply([
          `### ${assignment.title} · 提交汇总`,
          `共 ${assignment.submissions.length} 份提交`,
          ...rows,
          "\n请打开教师审核页面继续处理。",
        ].join("\n"), false, attachments));
      }

      return response.json(mattermostReply(`未知子命令：${command}。请输入 \`/ds help\`。`));
    } catch (error) {
      logError("mattermost.command_failed", error, { requestId: response.locals.requestId });
      response.status(500).json(mattermostReply("命令处理失败，请检查后端日志。"));
    }
  });

  router.post("/actions", async (request, response) => {
    try {
      const { user_id: mattermostUserId, user_name: username, context } = request.body as {
        user_id?: unknown;
        user_name?: unknown;
        context?: unknown;
      };
      if (!isNonEmptyString(mattermostUserId) || !isNonEmptyString(username) || !context || typeof context !== "object") {
        return response.status(400).json({ ephemeral_text: "交互请求缺少用户或操作信息。" });
      }
      const actionContext = context as Record<string, unknown>;
      const { action, evaluationId, submissionId, signature } = actionContext;
      if (
        (action !== "confirm" && action !== "regrade") ||
        !isNonEmptyString(evaluationId) || !isNonEmptyString(submissionId) || !isNonEmptyString(signature)
      ) {
        return response.status(400).json({ ephemeral_text: "交互操作参数无效。" });
      }
      if (!input.signer.verify(action, evaluationId, submissionId, signature)) {
        logWarn("mattermost.action_signature_rejected", {
          requestId: response.locals.requestId,
          action,
          evaluationId,
          submissionId,
          mattermostUserId,
          username,
        });
        return response.status(403).json({ ephemeral_text: "交互操作签名无效，请重新执行 /ds summary。" });
      }
      const user = await findUser(mattermostUserId, username);
      if (!user || user.role !== "teacher") {
        return response.status(403).json({ ephemeral_text: "只有教师账号可以审核评估结果。" });
      }
      const evaluation = await input.database.evaluation.findUnique({
        where: { id: evaluationId },
        select: { id: true, submissionId: true, score: true, grade: true, version: true },
      });
      if (!evaluation || evaluation.submissionId !== submissionId) {
        return response.status(404).json({ ephemeral_text: "评估记录不存在或已经更新，请重新执行 /ds summary。" });
      }
      logInfo("mattermost.action_received", {
        requestId: response.locals.requestId,
        action,
        evaluationId,
        submissionId,
        systemUserId: user.id,
        username,
      });
      if (action === "confirm") {
        const result = await input.grading.reviewEvaluation({ kind: "confirm", evaluationId, actorId: user.id });
        if (!result) return response.status(404).json({ ephemeral_text: "评估记录不存在。" });
        logInfo("mattermost.action_completed", {
          requestId: response.locals.requestId,
          action,
          evaluationId,
          submissionId,
          systemUserId: user.id,
          version: result.evaluation.version,
        });
        return response.json({
          ephemeral_text: `已确认评估：${result.evaluation.score} 分 / ${result.evaluation.grade}（v${result.evaluation.version}）。`,
          skip_slack_parsing: true,
        });
      }
      void input.grading.reviewEvaluation({ kind: "regrade", evaluationId, actorId: user.id })
        .then((result) => {
          if (result) logInfo("mattermost.action_completed", {
            action,
            evaluationId: result.evaluation.id,
            submissionId,
            systemUserId: user.id,
            version: result.evaluation.version,
          });
        })
        .catch((error) => logError("mattermost.regrade_failed", error, {
          evaluationId,
          submissionId,
          systemUserId: user.id,
        }));
      response.json({
        ephemeral_text: "已触发 Agent 重新评估。请稍后刷新教师审核页面，或再次执行 /ds summary 查看结果。",
        skip_slack_parsing: true,
      });
    } catch (error) {
      logError("mattermost.action_failed", error, { requestId: response.locals.requestId });
      response.status(500).json({ ephemeral_text: "交互操作处理失败，请检查后端日志。" });
    }
  });

  return router;
}
