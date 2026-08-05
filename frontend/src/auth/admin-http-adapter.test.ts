import { describe, expect, it, vi } from "vitest";
import { createHttpAuthAdminGateway } from "./admin-http-adapter";

describe("auth admin HTTP adapter", () => {
  it("uses protected account lifecycle routes without leaking transport details", async () => {
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "POST") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({
        id: "user-1",
        username: "student",
        displayName: "Student",
        role: "student",
        disabled: true,
        createdAt: "2026-08-05T00:00:00.000Z",
      }), { status: 200 });
    });
    const gateway = createHttpAuthAdminGateway("http://backend", request);

    await gateway.resetPassword("user-1", "new-password-123", "csrf-1");
    expect(request).toHaveBeenNthCalledWith(1, "http://backend/auth/users/user-1/password-reset", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-csrf-token": "csrf-1" }),
    }));

    const updated = await gateway.setDisabled("user-1", true, "csrf-1");
    expect(updated.disabled).toBe(true);
    expect(request).toHaveBeenNthCalledWith(2, "http://backend/auth/users/user-1/status", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
    }));
  });
});
