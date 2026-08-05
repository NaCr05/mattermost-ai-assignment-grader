import type { Assignment, Evaluation, Submission } from "../types/grading";

export const gradeOrder: Evaluation["grade"][] = ["A", "B", "C", "D", "F"];

export type SubmissionStatusFilter =
  | "all"
  | "unevaluated"
  | Evaluation["status"];

export type SubmissionSort =
  | "newest"
  | "score-desc"
  | "score-asc"
  | "student";

export type ReviewQueueFilters = {
  search: string;
  status: SubmissionStatusFilter;
  grade: "all" | Evaluation["grade"];
  sort: SubmissionSort;
};

export function selectVisibleAssignments(
  assignments: Assignment[],
  selectedId: string,
  search: string,
) {
  const query = search.trim().toLocaleLowerCase("zh-CN");
  if (!query) return assignments;

  const matches = assignments.filter((assignment) =>
    `${assignment.title} ${assignment.question}`
      .toLocaleLowerCase("zh-CN")
      .includes(query),
  );
  const selected = assignments.find((assignment) => assignment.id === selectedId);

  return selected && !matches.some((assignment) => assignment.id === selected.id)
    ? [selected, ...matches]
    : matches;
}

export function calculateReviewStats(submissions: Submission[]) {
  return {
    total: submissions.length,
    pending: submissions.filter(
      (item) => !item.evaluation || item.evaluation.status === "generated",
    ).length,
    confirmed: submissions.filter(
      (item) => item.evaluation?.status === "confirmed",
    ).length,
    modified: submissions.filter(
      (item) => item.evaluation?.status === "modified",
    ).length,
  };
}

export function calculateAgentStats(submissions: Submission[]) {
  const evaluations = submissions.flatMap((submission) =>
    submission.evaluation ? [submission.evaluation] : [],
  );
  const scores = evaluations.map((evaluation) => evaluation.score);
  const gradeCounts = Object.fromEntries(
    gradeOrder.map((grade) => [
      grade,
      evaluations.filter((evaluation) => evaluation.grade === grade).length,
    ]),
  ) as Record<Evaluation["grade"], number>;
  const completenessCounts = {
    complete: evaluations.filter(
      (evaluation) => evaluation.completenessLevel === "complete",
    ).length,
    partial: evaluations.filter(
      (evaluation) => evaluation.completenessLevel === "partial",
    ).length,
    incomplete: evaluations.filter(
      (evaluation) => evaluation.completenessLevel === "incomplete",
    ).length,
  };

  return {
    evaluated: evaluations.length,
    average:
      scores.length > 0
        ? Math.round(
            scores.reduce((total, score) => total + score, 0) / scores.length,
          )
        : null,
    highest: scores.length > 0 ? Math.max(...scores) : null,
    lowest: scores.length > 0 ? Math.min(...scores) : null,
    gradeCounts,
    completenessCounts,
    maxGradeCount: Math.max(1, ...Object.values(gradeCounts)),
  };
}

export function filterAndSortSubmissions(
  submissions: Submission[],
  filters: ReviewQueueFilters,
) {
  const query = filters.search.trim().toLocaleLowerCase("zh-CN");
  const filtered = [...submissions].filter((submission) => {
    const evaluation = submission.evaluation;
    const matchesSearch =
      !query ||
      `${submission.student.displayName} ${submission.student.username} ${submission.answer}`
        .toLocaleLowerCase("zh-CN")
        .includes(query);
    const matchesStatus =
      filters.status === "all" ||
      (filters.status === "unevaluated"
        ? !evaluation
        : evaluation?.status === filters.status);
    const matchesGrade =
      filters.grade === "all" || evaluation?.grade === filters.grade;

    return matchesSearch && matchesStatus && matchesGrade;
  });

  return filtered.sort((left, right) => {
    if (filters.sort === "student") {
      return left.student.displayName.localeCompare(
        right.student.displayName,
        "zh-CN",
      );
    }
    if (filters.sort === "score-desc") {
      return (right.evaluation?.score ?? -1) - (left.evaluation?.score ?? -1);
    }
    if (filters.sort === "score-asc") {
      return (left.evaluation?.score ?? 101) - (right.evaluation?.score ?? 101);
    }
    return (
      new Date(right.submittedAt).getTime() -
      new Date(left.submittedAt).getTime()
    );
  });
}
