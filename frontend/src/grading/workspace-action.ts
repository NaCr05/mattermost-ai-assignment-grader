export type WorkspaceActionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function captureWorkspaceAction(
  action: () => Promise<void>,
): Promise<WorkspaceActionResult> {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "操作失败。",
    };
  }
}
