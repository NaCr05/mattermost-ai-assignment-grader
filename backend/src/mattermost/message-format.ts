import type express from "express";
import { isNonEmptyString } from "../http/error-mapping";
import type { MattermostInteractiveAction, MattermostSigner } from "./signing";

export type MattermostAttachment = {
  fallback: string;
  color: string;
  title: string;
  text: string;
  fields: Array<{ short: boolean; title: string; value: string }>;
  actions: Array<{
    id: string;
    name: string;
    type: "button";
    style?: "primary" | "danger";
    integration: {
      url: string;
      context: {
        action: MattermostInteractiveAction;
        evaluationId: string;
        submissionId: string;
        version: number;
        signature: string;
      };
    };
  }>;
};

export function mattermostReply(
  text: string,
  inChannel = false,
  attachments: MattermostAttachment[] = [],
) {
  return {
    response_type: inChannel ? "in_channel" : "ephemeral",
    text,
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

function resolveActionUrl(request: express.Request, configuredUrl?: string) {
  if (isNonEmptyString(configuredUrl)) return configuredUrl.trim();
  const forwardedProtocol = request.header("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwardedProtocol || request.protocol}://${request.get("host")}/mattermost/actions`;
}

export function buildMattermostEvaluationAttachment(
  request: express.Request,
  input: {
    submissionId: string;
    studentName: string;
    answer: string;
    evaluation: { id: string; score: number; grade: string; status: string; version: number };
  },
  signer: MattermostSigner,
  configuredActionUrl?: string,
): MattermostAttachment {
  const actionUrl = resolveActionUrl(request, configuredActionUrl);
  const answerPreview = input.answer.length > 120 ? `${input.answer.slice(0, 120)}…` : input.answer;
  const createAction = (
    action: MattermostInteractiveAction,
    name: string,
    style?: "primary" | "danger",
  ) => ({
    id: `${action}${input.evaluation.id}`,
    name,
    type: "button" as const,
    ...(style ? { style } : {}),
    integration: {
      url: actionUrl,
      context: {
        action,
        evaluationId: input.evaluation.id,
        submissionId: input.submissionId,
        version: input.evaluation.version,
        signature: signer.sign(
          action,
          input.evaluation.id,
          input.submissionId,
          input.evaluation.version,
        ),
      },
    },
  });
  return {
    fallback: `${input.studentName}：${input.evaluation.score} 分 / ${input.evaluation.grade}`,
    color: input.evaluation.status === "confirmed" ? "#2E7D32" : "#C98245",
    title: `${input.studentName} · AI 评估`,
    text: answerPreview,
    fields: [
      { short: true, title: "评分", value: `${input.evaluation.score} / 100（${input.evaluation.grade}）` },
      { short: true, title: "状态 / 版本", value: `${input.evaluation.status} / v${input.evaluation.version}` },
    ],
    actions: [createAction("confirm", "确认评估", "primary"), createAction("regrade", "重新评估")],
  };
}
