import type {
  EvaluationAudit,
  EvaluationAuditAction,
  EvaluationStatus,
} from "../types/grading";

export const statusLabels: Record<EvaluationStatus, string> = {
  generated: "待教师审核",
  confirmed: "教师已确认",
  modified: "教师已修改",
  regrading: "正在重新评估",
  failed: "评估失败",
};

export const levelLabels: Record<string, string> = {
  complete: "完整",
  partial: "部分完整",
  incomplete: "不完整",
  correct: "正确",
  mostly_correct: "大体正确",
  partially_correct: "部分正确",
  incorrect: "错误",
  uncertain: "信息不足",
};

export const auditActionLabels: Record<EvaluationAuditAction, string> = {
  baseline: "历史基线",
  generated: "Agent 初次评估",
  regraded: "Agent 重新评估",
  confirmed: "教师确认",
  modified: "教师修改",
};

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAuditSnapshot(audit: EvaluationAudit) {
  if (!isRecord(audit.snapshot)) return null;

  const nestedEvaluation = audit.snapshot.evaluation;
  return isRecord(nestedEvaluation) ? nestedEvaluation : audit.snapshot;
}

export function getAuditValue(
  audit: EvaluationAudit,
  key: "score" | "grade" | "status",
) {
  const snapshot = getAuditSnapshot(audit);
  const value = snapshot?.[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}
