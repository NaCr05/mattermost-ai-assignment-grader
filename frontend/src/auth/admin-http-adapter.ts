import type { AuthAdminGateway, ManagedUser } from "./admin-gateway";

const DEFAULT_BASE_URL = "http://localhost:3001";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) as unknown : null;
  if (!response.ok) {
    const message = data && typeof data === "object" && "message" in data
      ? String(data.message)
      : `请求失败：${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export function createHttpAuthAdminGateway(
  baseUrl = import.meta.env.VITE_API_URL ?? DEFAULT_BASE_URL,
  request: typeof fetch = fetch,
): AuthAdminGateway {
  return {
    async listUsers() {
      const response = await request(`${baseUrl}/auth/users`, { credentials: "include" });
      return readJson<ManagedUser[]>(response);
    },
    async resetPassword(userId, password, csrfToken) {
      const response = await request(`${baseUrl}/auth/users/${userId}/password-reset`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) await readJson<unknown>(response);
    },
    async setDisabled(userId, disabled, csrfToken) {
      const response = await request(`${baseUrl}/auth/users/${userId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ disabled }),
      });
      return readJson<ManagedUser>(response);
    },
  };
}

export const authAdminGateway = createHttpAuthAdminGateway();
