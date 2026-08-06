export const teacherSession = {
  user: {
    id: "teacher-demo",
    username: "demo-teacher",
    displayName: "演示教师",
    role: "teacher",
  },
  csrfToken: "synthetic-csrf-token",
};

export const studentSession = {
  user: {
    id: "student-demo",
    username: "demo-student",
    displayName: "匿名学生",
    role: "student",
  },
  csrfToken: "synthetic-student-csrf-token",
};

export const assignments = [
  {
    id: "assignment-linked-list",
    title: "链表反转：迭代与复杂度分析",
    question: "说明如何原地反转单链表，并分析时间与空间复杂度。",
    deadline: "2026-08-12T15:59:00.000Z",
    instructions: "答案应说明指针更新顺序和空链表边界。",
    status: "published",
    createdBy: {
      id: "teacher-demo",
      username: "demo-teacher",
      displayName: "演示教师",
    },
    _count: { submissions: 3 },
  },
  {
    id: "assignment-stack",
    title: "栈与括号匹配",
    question: "使用栈判断括号序列是否合法。",
    deadline: "2026-08-19T15:59:00.000Z",
    instructions: null,
    status: "published",
    createdBy: {
      id: "teacher-demo",
      username: "demo-teacher",
      displayName: "演示教师",
    },
    _count: { submissions: 2 },
  },
];

export const submissionSummary = {
  assignment: {
    id: "assignment-linked-list",
    title: "链表反转：迭代与复杂度分析",
  },
  count: 3,
  submissions: [
    {
      id: "submission-a",
      answer: "保存 next 后让 current.next 指向 previous，再依次推进三个指针。遍历一次，时间 O(n)，额外空间 O(1)。",
      status: "evaluated",
      submittedAt: "2026-08-06T08:30:00.000Z",
      student: {
        id: "student-a",
        username: "student-a",
        displayName: "匿名学生 A",
      },
      evaluation: {
        id: "evaluation-a",
        submissionId: "submission-a",
        completenessLevel: "complete",
        completenessComment: "步骤、边界和复杂度说明完整。",
        correctnessLevel: "correct",
        correctnessComment: "指针更新顺序正确，并避免丢失后续节点。",
        mainProblems: ["可以进一步说明空链表和单节点链表无需特殊改动。"],
        suggestions: ["补充简短伪代码，明确 previous、current 和 next 的初始值。"],
        score: 92,
        grade: "A",
        status: "modified",
        version: 3,
        reviewedById: "teacher-demo",
        reviewedAt: "2026-08-06T09:10:00.000Z",
      },
    },
    {
      id: "submission-b",
      answer: "循环把 next 指向 current，然后移动 current，复杂度是 O(n)。",
      status: "evaluated",
      submittedAt: "2026-08-06T08:42:00.000Z",
      student: {
        id: "student-b",
        username: "student-b",
        displayName: "匿名学生 B",
      },
      evaluation: {
        id: "evaluation-b",
        submissionId: "submission-b",
        completenessLevel: "partial",
        completenessComment: "给出了遍历思路，但缺少完整的指针关系。",
        correctnessLevel: "partially_correct",
        correctnessComment: "next 的指向描述存在歧义，可能破坏剩余链表。",
        mainProblems: ["没有先保存后继节点。", "没有说明 previous 指针。"],
        suggestions: ["明确写出保存 next、反转 current.next、推进指针的顺序。"],
        score: 68,
        grade: "D",
        status: "generated",
        version: 1,
        reviewedById: null,
        reviewedAt: null,
      },
    },
    {
      id: "submission-c",
      answer: "使用递归处理剩余链表，再把后继节点指回当前节点。",
      status: "submitted",
      submittedAt: "2026-08-06T08:55:00.000Z",
      student: {
        id: "student-c",
        username: "student-c",
        displayName: "匿名学生 C",
      },
      evaluation: null,
    },
  ],
};

export const auditResponse = {
  submissionId: "submission-a",
  count: 3,
  audits: [
    {
      id: "audit-generated",
      evaluationId: "evaluation-a",
      submissionId: "submission-a",
      action: "generated",
      version: 1,
      snapshot: { score: 84, grade: "B", status: "generated" },
      actorId: null,
      actor: null,
      createdAt: "2026-08-06T08:31:00.000Z",
    },
    {
      id: "audit-regraded",
      evaluationId: "evaluation-a",
      submissionId: "submission-a",
      action: "regraded",
      version: 2,
      snapshot: { score: 88, grade: "B", status: "generated" },
      actorId: "teacher-demo",
      actor: {
        id: "teacher-demo",
        username: "demo-teacher",
        displayName: "演示教师",
      },
      createdAt: "2026-08-06T09:00:00.000Z",
    },
    {
      id: "audit-modified",
      evaluationId: "evaluation-a",
      submissionId: "submission-a",
      action: "modified",
      version: 3,
      snapshot: { score: 92, grade: "A", status: "modified" },
      actorId: "teacher-demo",
      actor: {
        id: "teacher-demo",
        username: "demo-teacher",
        displayName: "演示教师",
      },
      createdAt: "2026-08-06T09:10:00.000Z",
    },
  ],
};
