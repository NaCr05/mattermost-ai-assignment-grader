import express from "express";
import type { CurrentUser } from "../auth/http-adapter";
import { toAssignmentDto } from "../grading/dto";
import type { prisma as defaultPrisma } from "../prisma";
import { isNonEmptyString, sendServerError } from "./error-mapping";

type Database = typeof defaultPrisma;

export function createAssignmentsRouter(input: {
  database: Database;
  currentUser(response: express.Response): CurrentUser | undefined;
}) {
  const router = express.Router();
  const includeSummary = {
    createdBy: {
      select: { id: true, username: true, displayName: true, role: true },
    },
    _count: { select: { submissions: true } },
  } as const;

  router.post("/", async (request, response) => {
    try {
      const user = input.currentUser(response);
      if (user?.role !== "teacher") {
        return response.status(403).json({ message: "Only a teacher can publish an assignment" });
      }
      const { title, question, deadline, instructions } = request.body;
      if (!isNonEmptyString(title) || !isNonEmptyString(question) || !isNonEmptyString(deadline)) {
        return response.status(400).json({ message: "title, question and deadline are required" });
      }
      const parsedDeadline = new Date(deadline);
      if (Number.isNaN(parsedDeadline.getTime())) {
        return response.status(400).json({ message: "deadline must be a valid date" });
      }
      const assignment = await input.database.assignment.create({
        data: {
          title: title.trim(),
          question: question.trim(),
          deadline: parsedDeadline,
          instructions: isNonEmptyString(instructions) ? instructions.trim() : null,
          createdById: user.id,
        },
        include: includeSummary,
      });
      response.status(201).json(toAssignmentDto(assignment));
    } catch (error) {
      sendServerError(response, "Failed to publish assignment", error);
    }
  });

  router.get("/", async (_request, response) => {
    try {
      const user = input.currentUser(response)!;
      const assignments = await input.database.assignment.findMany({
        where: user.role === "teacher" ? { createdById: user.id } : { status: "published" },
        include: includeSummary,
        orderBy: { createdAt: "desc" },
      });
      response.json(assignments.map(toAssignmentDto));
    } catch (error) {
      sendServerError(response, "Failed to list assignments", error);
    }
  });

  router.get("/:id", async (request, response) => {
    try {
      const user = input.currentUser(response)!;
      const assignment = await input.database.assignment.findUnique({
        where: { id: request.params.id },
        include: includeSummary,
      });
      if (!assignment) return response.status(404).json({ message: "Assignment not found" });
      if (
        (user.role === "teacher" && assignment.createdById !== user.id) ||
        (user.role === "student" && assignment.status !== "published")
      ) {
        return response.status(403).json({ message: "Assignment access denied" });
      }
      response.json(toAssignmentDto(assignment));
    } catch (error) {
      sendServerError(response, "Failed to get assignment", error);
    }
  });

  return router;
}
