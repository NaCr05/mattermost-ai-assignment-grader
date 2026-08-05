export type ManagedUser = {
  id: string;
  username: string;
  displayName: string;
  role: "teacher" | "student";
  disabled: boolean;
  createdAt: string;
};

export type AuthAdminGateway = {
  listUsers(): Promise<ManagedUser[]>;
  resetPassword(userId: string, password: string, csrfToken: string): Promise<void>;
  setDisabled(userId: string, disabled: boolean, csrfToken: string): Promise<ManagedUser>;
};
