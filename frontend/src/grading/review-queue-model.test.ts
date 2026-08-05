import { describe, expect, it } from "vitest";
import type { Assignment, Submission } from "../types/grading";
import {
  calculateAgentStats,
  calculateReviewStats,
  filterAndSortSubmissions,
  selectVisibleAssignments,
} from "./review-queue-model";

const assignments: Assignment[] = [
  {
    id: "assignment-1",
    title: "Stacks",
    question: "Explain LIFO",
    deadline: "2026-01-01T00:00:00.000Z",
    instructions: null,
    status: "published",
    createdBy: { id: "teacher-1", username: "teacher", displayName: "Teacher" },
    _count: { submissions: 1 },
  },
  {
    id: "assignment-2",
    title: "Queues",
    question: "Explain FIFO",
    deadline: "2026-01-02T00:00:00.000Z",
    instructions: null,
    status: "published",
    createdBy: { id: "teacher-1", username: "teacher", displayName: "Teacher" },
    _count: { submissions: 2 },
  },
];

const submissions: Submission[] = [
  {
    id: "submission-1",
    answer: "LIFO",
    status: "evaluated",
    submittedAt: "2026-01-01T00:00:00.000Z",
    student: { id: "student-1", username: "alex", displayName: "Alex" },
    evaluation: {
      id: "evaluation-1",
      submissionId: "submission-1",
      completenessLevel: "complete",
      completenessComment: "Complete",
      correctnessLevel: "correct",
      correctnessComment: "Correct",
      mainProblems: ["None"],
      suggestions: ["Continue"],
      score: 95,
      grade: "A",
      status: "confirmed",
      version: 1,
      reviewedById: "teacher-1",
      reviewedAt: "2026-01-01T01:00:00.000Z",
    },
  },
  {
    id: "submission-2",
    answer: "FIFO",
    status: "submitted",
    submittedAt: "2026-01-02T00:00:00.000Z",
    student: { id: "student-2", username: "julia", displayName: "Julia" },
    evaluation: null,
  },
];

describe("review queue model", () => {
  it("keeps the selected assignment visible while searching", () => {
    const visible = selectVisibleAssignments(assignments, "assignment-1", "FIFO");
    expect(visible.map((assignment) => assignment.id)).toEqual([
      "assignment-1",
      "assignment-2",
    ]);
  });

  it("derives review and Agent statistics", () => {
    expect(calculateReviewStats(submissions)).toEqual({
      total: 2,
      pending: 1,
      confirmed: 1,
      modified: 0,
    });
    expect(calculateAgentStats(submissions)).toMatchObject({
      evaluated: 1,
      average: 95,
      highest: 95,
      lowest: 95,
    });
  });

  it("filters and sorts without mutating the source queue", () => {
    const sourceOrder = submissions.map((submission) => submission.id);
    const result = filterAndSortSubmissions(submissions, {
      search: "",
      status: "all",
      grade: "all",
      sort: "newest",
    });
    expect(result.map((submission) => submission.id)).toEqual([
      "submission-2",
      "submission-1",
    ]);
    expect(submissions.map((submission) => submission.id)).toEqual(sourceOrder);
  });
});
