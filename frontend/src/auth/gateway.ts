export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: "teacher" | "student";
};

export type Session = {
  user: SessionUser;
  csrfToken: string;
};

export type AuthGateway = {
  current(): Promise<Session>;
  login(username: string, password: string): Promise<Session>;
  logout(csrfToken: string): Promise<void>;
  revokeSessions(csrfToken: string): Promise<void>;
};
