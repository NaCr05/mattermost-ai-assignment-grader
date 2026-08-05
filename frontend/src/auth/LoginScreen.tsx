import { useState, type FormEvent } from "react";

export function LoginScreen(input: {
  error: string;
  onLogin(username: string, password: string): Promise<boolean>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    await input.onLogin(username, password);
    setSubmitting(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <span className="brand-mark" aria-hidden="true"><span>T</span></span>
        <p className="eyebrow">TIDE / SECURE WORKSPACE</p>
        <h1 id="login-title">登录作业评估平台</h1>
        <p>使用平台管理员为你创建的账号进入。身份与审核记录将由服务端会话确定。</p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span>用户名</span>
            <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>
          <label>
            <span>密码</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {input.error && <p className="auth-error" role="alert">{input.error}</p>}
          <button className="button" disabled={submitting} type="submit">
            {submitting ? "正在登录…" : "登录"}
          </button>
        </form>
      </section>
    </main>
  );
}
