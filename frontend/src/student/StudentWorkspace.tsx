import type { Session } from "../auth/gateway";

export type StudentWorkspaceProps = {
  session: Session;
  authError: string;
  onLogout(): Promise<void>;
  onRevokeSessions(): Promise<boolean>;
};

export function StudentWorkspace(input: StudentWorkspaceProps) {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="student-workspace-title">
        <p className="eyebrow">STUDENT WORKSPACE</p>
        <h1 id="student-workspace-title">学生账号已登录</h1>
        <p>
          欢迎，{input.session.user.displayName}。独立学生 Web 工作区将在后续版本提供；
          当前请通过已配置的 Mattermost 或课程入口提交和查看内容。
        </p>
        {input.authError && (
          <p className="auth-error" role="alert">{input.authError}</p>
        )}
        <button
          className="button"
          type="button"
          onClick={() => void input.onLogout()}
        >
          退出登录
        </button>
        <button
          className="button button--ghost"
          type="button"
          onClick={() => void input.onRevokeSessions()}
        >
          退出所有设备
        </button>
      </section>
    </main>
  );
}
