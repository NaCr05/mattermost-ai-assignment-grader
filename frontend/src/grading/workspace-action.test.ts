import { describe, expect, it } from "vitest";
import { captureWorkspaceAction } from "./workspace-action";

describe("workspace action result", () => {
  it("reports success only after the action completes", async () => {
    await expect(captureWorkspaceAction(async () => undefined)).resolves.toEqual({
      ok: true,
    });
  });

  it("preserves a useful error result for callers", async () => {
    await expect(
      captureWorkspaceAction(async () => {
        throw new Error("version conflict");
      }),
    ).resolves.toEqual({ ok: false, message: "version conflict" });
  });
});
