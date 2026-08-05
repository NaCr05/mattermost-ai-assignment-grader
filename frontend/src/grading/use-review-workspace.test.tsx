// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Assignment, Evaluation, SubmissionSummary } from "../types/grading";
import { createFakeGradingGateway } from "./fake-adapter";
import { useReviewWorkspace } from "./use-review-workspace";

const evaluation: Evaluation = {
  id: "evaluation-1",
  submissionId: "submission-1",
  completenessLevel: "complete",
  completenessComment: "Complete.",
  correctnessLevel: "correct",
  correctnessComment: "Correct.",
  mainProblems: ["None."],
  suggestions: ["Continue."],
  score: 90,
  grade: "A",
  status: "generated",
  version: 1,
  reviewedById: null,
  reviewedAt: null,
};

const assignments: Assignment[] = [
  {
    id: "assignment-a",
    title: "Assignment A",
    question: "A?",
    deadline: "2028-01-01T00:00:00.000Z",
    instructions: null,
    status: "published",
    createdBy: { id: "teacher", username: "teacher", displayName: "Teacher" },
    _count: { submissions: 2 },
  },
  {
    id: "assignment-b",
    title: "Assignment B",
    question: "B?",
    deadline: "2028-01-01T00:00:00.000Z",
    instructions: null,
    status: "published",
    createdBy: { id: "teacher", username: "teacher", displayName: "Teacher" },
    _count: { submissions: 1 },
  },
];

function summary(assignmentId: string): SubmissionSummary {
  return {
    assignment: { id: assignmentId, title: assignmentId },
    count: 1,
    submissions: [{
      id: "submission-1",
      answer: "Answer",
      status: "evaluated",
      submittedAt: "2027-01-01T00:00:00.000Z",
      student: { id: "student", username: "student", displayName: "Student" },
      evaluation,
    }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("review workspace state", () => {
  it("retains the edit draft when saving fails", async () => {
    const gateway = createFakeGradingGateway({
      listAssignments: async () => [assignments[0]],
      loadSubmissionSummary: async () => summary("assignment-a"),
      updateEvaluation: vi.fn().mockRejectedValue(new Error("保存失败")),
    });
    const { result } = renderHook(() => useReviewWorkspace({ gateway }));
    await waitFor(() => expect(result.current.queue.summary?.count).toBe(1));

    act(() => result.current.editor.begin(evaluation));
    act(() => result.current.editor.setDraft({
      score: 82,
      grade: "B",
      correctnessComment: "教师草稿仍应保留。",
    }));
    await act(async () => { await result.current.editor.save(evaluation); });

    expect(result.current.feedback.error).toBe("保存失败");
    expect(result.current.editor.editingId).toBe(evaluation.id);
    expect(result.current.editor.draft?.correctnessComment).toBe("教师草稿仍应保留。");
  });

  it("does not replace a new queue with a late response from an old assignment", async () => {
    const oldQueue = deferred<SubmissionSummary>();
    const gateway = createFakeGradingGateway({
      listAssignments: async () => assignments,
      loadSubmissionSummary: async (assignmentId) =>
        assignmentId === "assignment-a" ? oldQueue.promise : summary("assignment-b"),
    });
    const { result } = renderHook(() => useReviewWorkspace({ gateway }));
    await waitFor(() => expect(result.current.assignments.selectedId).toBe("assignment-a"));
    act(() => result.current.assignments.select("assignment-b"));
    await waitFor(() => expect(result.current.queue.summary?.assignment.id).toBe("assignment-b"));

    await act(async () => { oldQueue.resolve(summary("assignment-a")); });
    expect(result.current.queue.summary?.assignment.id).toBe("assignment-b");
  });
});
