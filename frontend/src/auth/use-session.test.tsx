// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AuthGateway, Session } from "./gateway";
import { getCsrfToken } from "./session-store";
import { useSession } from "./use-session";

const session: Session = {
  user: {
    id: "teacher-1",
    username: "teacher",
    displayName: "Teacher",
    role: "teacher",
  },
  csrfToken: "csrf-token",
};

function createGateway(overrides: Partial<AuthGateway> = {}): AuthGateway {
  return {
    current: async () => session,
    login: async () => session,
    logout: async () => undefined,
    revokeSessions: async () => undefined,
    ...overrides,
  };
}

describe("session state", () => {
  it("clears local authentication after all server sessions are revoked", async () => {
    const revokeSessions = vi.fn(async () => undefined);
    const gateway = createGateway({ revokeSessions });
    const { result } = renderHook(() => useSession(gateway));
    await waitFor(() => expect(result.current.session?.user.id).toBe("teacher-1"));

    await act(async () => {
      expect(await result.current.revokeSessions()).toBe(true);
    });

    expect(revokeSessions).toHaveBeenCalledWith("csrf-token");
    expect(result.current.session).toBeNull();
    expect(getCsrfToken()).toBe("");
  });

  it("keeps the session when server-side revocation fails", async () => {
    const gateway = createGateway({
      revokeSessions: async () => { throw new Error("撤销失败"); },
    });
    const { result } = renderHook(() => useSession(gateway));
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      expect(await result.current.revokeSessions()).toBe(false);
    });

    expect(result.current.session).not.toBeNull();
    expect(result.current.error).toBe("撤销失败");
  });
});
