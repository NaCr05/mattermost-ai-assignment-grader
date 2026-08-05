import { useCallback, useEffect, useState } from "react";
import type { AuthGateway, Session } from "./gateway";
import { authGateway } from "./http-adapter";
import { clearCsrfToken, setCsrfToken } from "./session-store";

export function useSession(gateway: AuthGateway = authGateway) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    gateway.current()
      .then((next) => {
        if (!active) return;
        setSession(next);
        setCsrfToken(next.csrfToken);
      })
      .catch(() => {
        if (!active) return;
        clearCsrfToken();
        setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [gateway]);

  const login = useCallback(async (username: string, password: string) => {
    setError("");
    try {
      const next = await gateway.login(username, password);
      setSession(next);
      setCsrfToken(next.csrfToken);
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "登录失败。请稍后重试。");
      return false;
    }
  }, [gateway]);

  const logout = useCallback(async () => {
    if (session) await gateway.logout(session.csrfToken);
    clearCsrfToken();
    setSession(null);
  }, [gateway, session]);

  const revokeSessions = useCallback(async () => {
    if (!session) return true;
    setError("");
    try {
      await gateway.revokeSessions(session.csrfToken);
      clearCsrfToken();
      setSession(null);
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "会话撤销失败。请稍后重试。",
      );
      return false;
    }
  }, [gateway, session]);

  return { session, loading, error, login, logout, revokeSessions };
}
