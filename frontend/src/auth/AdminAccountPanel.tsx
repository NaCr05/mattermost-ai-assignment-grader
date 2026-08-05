import { useState, type FormEvent, type SyntheticEvent } from "react";
import type { Session } from "./gateway";
import { authAdminGateway } from "./admin-http-adapter";
import type { AuthAdminGateway, ManagedUser } from "./admin-gateway";

export function AdminAccountPanel(input: {
  session: Session;
  gateway?: AuthAdminGateway;
}) {
  const gateway = input.gateway ?? authAdminGateway;
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadUsers() {
    setError("");
    try {
      setUsers(await gateway.listUsers());
      setLoaded(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "账号列表加载失败。请稍后重试。");
    }
  }

  function openPanel(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open && !loaded) void loadUsers();
  }

  async function resetPassword(event: FormEvent, user: ManagedUser) {
    event.preventDefault();
    const password = passwords[user.id] ?? "";
    if (password.length < 12) {
      setError("新密码至少需要 12 个字符。");
      return;
    }
    setBusyId(user.id);
    setError("");
    setMessage("");
    try {
      await gateway.resetPassword(user.id, password, input.session.csrfToken);
      setPasswords((current) => ({ ...current, [user.id]: "" }));
      setMessage(`已重置 ${user.displayName} 的密码，并撤销其旧会话。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "密码重置失败。请稍后重试。");
    } finally {
      setBusyId("");
    }
  }

  async function setDisabled(user: ManagedUser) {
    setBusyId(user.id);
    setError("");
    setMessage("");
    try {
      const updated = await gateway.setDisabled(
        user.id,
        !user.disabled,
        input.session.csrfToken,
      );
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage(updated.disabled
        ? `已禁用 ${updated.displayName}，其旧会话已撤销。`
        : `已重新启用 ${updated.displayName}。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "账号状态更新失败。请稍后重试。");
    } finally {
      setBusyId("");
    }
  }

  return (
    <details className="account-admin" onToggle={openPanel}>
      <summary>账号管理</summary>
      <div className="account-admin__panel">
        <div className="account-admin__heading">
          <div>
            <strong>平台账号</strong>
            <span>重置密码或暂停账号；操作会写入认证审计。</span>
          </div>
          <button className="button button--ghost" type="button" onClick={() => void loadUsers()}>
            刷新
          </button>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="account-admin__message" role="status">{message}</p>}
        {!loaded && !error && <p role="status">正在加载账号…</p>}
        {loaded && (
          <ul className="account-list">
            {users.map((user) => (
              <li key={user.id}>
                <div className="account-list__identity">
                  <strong>{user.displayName}</strong>
                  <span>@{user.username} · {user.role === "teacher" ? "教师" : "学生"}</span>
                  <small>{user.disabled ? "已禁用" : "可登录"}</small>
                </div>
                <form onSubmit={(event) => void resetPassword(event, user)}>
                  <label>
                    <span className="sr-only">为 {user.displayName} 设置新密码</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      placeholder="新密码（至少 12 位）"
                      disabled={user.id === input.session.user.id}
                      value={passwords[user.id] ?? ""}
                      onChange={(event) => setPasswords((current) => ({
                        ...current,
                        [user.id]: event.target.value,
                      }))}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busyId === user.id || user.id === input.session.user.id}
                  >
                    重置密码
                  </button>
                </form>
                <button
                  type="button"
                  className="account-list__status"
                  disabled={busyId === user.id || user.id === input.session.user.id}
                  onClick={() => void setDisabled(user)}
                >
                  {user.disabled ? "重新启用" : "禁用账号"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
