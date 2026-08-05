import { useEffect, useMemo, useState } from "react";
import type {
  Assignment,
  Evaluation,
  EvaluationAudit,
  Submission,
  SubmissionSummary,
} from "../types/grading";
import type { GradingGateway } from "./gateway";
import { gradingGateway } from "./http-adapter";
import {
  calculateAgentStats,
  calculateReviewStats,
  filterAndSortSubmissions,
  selectVisibleAssignments,
  type SubmissionSort,
  type SubmissionStatusFilter,
} from "./review-queue-model";
import { captureWorkspaceAction } from "./workspace-action";

export type EditDraft = {
  score: number;
  grade: Evaluation["grade"];
  correctnessComment: string;
};

type ReviewWorkspaceOptions = {
  gateway?: GradingGateway;
};

function selectDefaultAssignment(assignments: Assignment[]) {
  return [...assignments].sort(
    (left, right) => right._count.submissions - left._count.submissions,
  )[0]?.id ?? "";
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useReviewWorkspace({
  gateway = gradingGateway,
}: ReviewWorkspaceOptions = {}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [summary, setSummary] = useState<SubmissionSummary | null>(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<SubmissionStatusFilter>("all");
  const [gradeFilter, setGradeFilter] = useState<
    "all" | Evaluation["grade"]
  >("all");
  const [sortBy, setSortBy] = useState<SubmissionSort>("newest");
  const [expandedAuditId, setExpandedAuditId] = useState("");
  const [auditLoadingId, setAuditLoadingId] = useState("");
  const [auditBySubmission, setAuditBySubmission] = useState<
    Record<string, EvaluationAudit[]>
  >({});
  const [auditErrors, setAuditErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    setAssignmentsLoading(true);
    setError("");

    gateway
      .listAssignments(controller.signal)
      .then((data) => {
        setAssignments(data);
        setSelectedId((current) =>
          current && data.some((assignment) => assignment.id === current)
            ? current
            : selectDefaultAssignment(data),
        );
      })
      .catch((requestError) => {
        if (!isAbortError(requestError)) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "页面数据加载失败。",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAssignmentsLoading(false);
      });

    return () => controller.abort();
  }, [gateway]);

  useEffect(() => {
    if (!selectedId) {
      setSummary(null);
      setQueueLoading(false);
      return;
    }

    const controller = new AbortController();
    setQueueLoading(true);
    setSummary(null);
    setError("");

    gateway
      .loadSubmissionSummary(selectedId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSummary(data);
      })
      .catch((requestError) => {
        if (!isAbortError(requestError)) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "提交汇总加载失败。",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setQueueLoading(false);
      });

    return () => controller.abort();
  }, [gateway, selectedId]);

  const selectedAssignment = assignments.find(
    (assignment) => assignment.id === selectedId,
  );
  const visibleAssignments = useMemo(
    () => selectVisibleAssignments(assignments, selectedId, assignmentSearch),
    [assignmentSearch, assignments, selectedId],
  );
  const submissions = useMemo(() => summary?.submissions ?? [], [summary]);
  const stats = useMemo(() => calculateReviewStats(submissions), [submissions]);
  const agentStats = useMemo(() => calculateAgentStats(submissions), [submissions]);
  const filteredSubmissions = useMemo(
    () =>
      filterAndSortSubmissions(submissions, {
        search: submissionSearch,
        status: statusFilter,
        grade: gradeFilter,
        sort: sortBy,
      }),
    [gradeFilter, sortBy, statusFilter, submissionSearch, submissions],
  );
  const hasActiveFilters =
    submissionSearch.trim().length > 0 ||
    statusFilter !== "all" ||
    gradeFilter !== "all" ||
    sortBy !== "newest";

  async function loadAudits(submissionId: string) {
    try {
      setAuditLoadingId(submissionId);
      setAuditErrors((current) => ({ ...current, [submissionId]: "" }));
      const data = await gateway.loadEvaluationAudits(submissionId);
      setAuditBySubmission((current) => ({
        ...current,
        [submissionId]: data.audits,
      }));
    } catch (requestError) {
      setAuditErrors((current) => ({
        ...current,
        [submissionId]:
          requestError instanceof Error
            ? requestError.message
            : "审计记录加载失败。",
      }));
    } finally {
      setAuditLoadingId("");
    }
  }

  async function toggleAudit(submissionId: string) {
    if (expandedAuditId === submissionId) {
      setExpandedAuditId("");
      return;
    }

    setExpandedAuditId(submissionId);
    await loadAudits(submissionId);
  }

  async function refresh() {
    setAssignmentsLoading(true);
    setError("");
    setNotice("");

    const result = await captureWorkspaceAction(async () => {
      const data = await gateway.listAssignments();
      setAssignments(data);
      const nextSelectedId =
        selectedId && data.some((assignment) => assignment.id === selectedId)
          ? selectedId
          : selectDefaultAssignment(data);

      if (nextSelectedId === selectedId && nextSelectedId) {
        setQueueLoading(true);
        setSummary(await gateway.loadSubmissionSummary(nextSelectedId));
        setQueueLoading(false);
      } else {
        setSelectedId(nextSelectedId);
      }
    });

    if (!result.ok) setError(result.message);
    setAssignmentsLoading(false);
    setQueueLoading(false);
  }

  async function runAction(
    id: string,
    action: () => Promise<void>,
    successMessage: string,
  ) {
    setBusyId(id);
    setError("");
    setNotice("");

    const result = await captureWorkspaceAction(async () => {
      await action();
      if (selectedId) {
        setSummary(await gateway.loadSubmissionSummary(selectedId));
      }
      if (expandedAuditId) {
        await loadAudits(expandedAuditId);
      }
    });

    setBusyId("");
    if (!result.ok) {
      setError(result.message);
      return false;
    }

    setNotice(successMessage);
    return true;
  }

  function confirmEvaluation(evaluation: Evaluation) {
    return runAction(
      evaluation.id,
      () => gateway.confirmEvaluation(evaluation.id),
      "评测结果已确认。",
    );
  }

  function regradeEvaluation(evaluation: Evaluation) {
    return runAction(
      evaluation.id,
      () => gateway.regradeEvaluation(evaluation.id),
      "Agent 已完成重新评测，版本号已更新。",
    );
  }

  function createEvaluation(submission: Submission) {
    return runAction(
      submission.id,
      () => gateway.evaluateSubmission(submission.id),
      "基础评测报告已生成。",
    );
  }

  function beginEditing(evaluation: Evaluation) {
    setEditingId(evaluation.id);
    setEditDraft({
      score: evaluation.score,
      grade: evaluation.grade,
      correctnessComment: evaluation.correctnessComment,
    });
  }

  function cancelEditing() {
    setEditingId("");
    setEditDraft(null);
  }

  async function saveEdit(evaluation: Evaluation) {
    if (!editDraft) return;

    const saved = await runAction(
      evaluation.id,
      () =>
        gateway.updateEvaluation(evaluation.id, {
          expectedVersion: evaluation.version,
          ...editDraft,
        }),
      "教师修改已保存。",
    );

    if (saved) cancelEditing();
  }

  function clearFilters() {
    setSubmissionSearch("");
    setStatusFilter("all");
    setGradeFilter("all");
    setSortBy("newest");
  }

  return {
    assignments: {
      selectedId,
      select: setSelectedId,
      selected: selectedAssignment,
      visible: visibleAssignments,
      search: assignmentSearch,
      setSearch: setAssignmentSearch,
    },
    queue: {
      summary,
      loading: assignmentsLoading || queueLoading,
      search: submissionSearch,
      setSearch: setSubmissionSearch,
      statusFilter,
      setStatusFilter,
      gradeFilter,
      setGradeFilter,
      sortBy,
      setSortBy,
      stats,
      agentStats,
      submissions: filteredSubmissions,
      hasActiveFilters,
      clearFilters,
    },
    editor: {
      busyId,
      editingId,
      draft: editDraft,
      setDraft: setEditDraft,
      confirm: confirmEvaluation,
      regrade: regradeEvaluation,
      create: createEvaluation,
      begin: beginEditing,
      cancel: cancelEditing,
      save: saveEdit,
    },
    audit: {
      expandedId: expandedAuditId,
      loadingId: auditLoadingId,
      bySubmission: auditBySubmission,
      errors: auditErrors,
      load: loadAudits,
      toggle: toggleAudit,
    },
    feedback: {
      error,
      notice,
      refresh,
    },
  };
}
