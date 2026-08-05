import type { createGradingModule } from "../grading/module";
import type { prisma as defaultPrisma } from "../prisma";
import { createMattermostRouter } from "./http-adapter";
import { createMattermostSigner } from "./signing";

export function createMattermostModule(input: {
  database: typeof defaultPrisma;
  grading: ReturnType<typeof createGradingModule>;
  slashToken?: string;
  teacherUsername?: string;
  actionUrl?: string;
}) {
  const signer = createMattermostSigner(input.slashToken);
  return createMattermostRouter({ ...input, signer });
}
