import "./App.css";
import { LoginScreen } from "./auth/LoginScreen";
import { useSession } from "./auth/use-session";
import { StudentWorkspace } from "./student/StudentWorkspace";
import { TeacherWorkspace } from "./workspace/TeacherWorkspace";

function App() {
  const { session, loading, error, login, logout, revokeSessions } = useSession();

  if (loading) {
    return (
      <main className="auth-shell">
        <p role="status">正在验证登录状态…</p>
      </main>
    );
  }

  if (!session) {
    return <LoginScreen error={error} onLogin={login} />;
  }

  const sessionActions = {
    session,
    authError: error,
    onLogout: logout,
    onRevokeSessions: revokeSessions,
  };

  return session.user.role === "teacher"
    ? <TeacherWorkspace {...sessionActions} />
    : <StudentWorkspace {...sessionActions} />;
}

export default App;
