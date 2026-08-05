import type { AuthGateway, Session } from "./gateway";

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

export function createHttpAuthGateway(
  baseUrl = import.meta.env.VITE_API_URL ?? DEFAULT_BASE_URL,
  request: typeof fetch = fetch,
): AuthGateway {
  return {
    async current() {
      const response = await request(`${baseUrl}/auth/me`, { credentials: "include" });
      return readJson<Session>(response);
    },
    async login(username, password) {
      const response = await request(`${baseUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      return readJson<Session>(response);
    },
    async logout(csrfToken) {
      const response = await request(`${baseUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!response.ok) await readJson<unknown>(response);
    },
    async revokeSessions(csrfToken) {
      const response = await request(`${baseUrl}/auth/sessions/revoke`, {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!response.ok) await readJson<unknown>(response);
    },
  };
}

export const authGateway = createHttpAuthGateway();
