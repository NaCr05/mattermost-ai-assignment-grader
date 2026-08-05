export type ReadinessResult = {
  status: "ready" | "not_ready";
  database: "connected" | "unavailable";
  agent: "connected" | "unavailable";
};

export type ReadinessProbe = {
  check(): Promise<ReadinessResult>;
};

type ReadinessDependencies = {
  checkDatabase(): Promise<unknown>;
  agentUrl?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
};

export function createReadinessProbe(
  dependencies: ReadinessDependencies,
): ReadinessProbe {
  const request = dependencies.fetchImplementation ?? fetch;
  const agentUrl = (dependencies.agentUrl ?? process.env.AGENT_URL ?? "http://localhost:8000")
    .replace(/\/$/, "");
  const timeoutMs = dependencies.timeoutMs ?? 5_000;

  return {
    async check() {
      const [database, agent] = await Promise.allSettled([
        dependencies.checkDatabase(),
        request(`${agentUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) })
          .then((response) => {
            if (!response.ok) throw new Error("Agent is unavailable");
          }),
      ]);
      const databaseStatus = database.status === "fulfilled" ? "connected" : "unavailable";
      const agentStatus = agent.status === "fulfilled" ? "connected" : "unavailable";
      return {
        status: databaseStatus === "connected" && agentStatus === "connected"
          ? "ready"
          : "not_ready",
        database: databaseStatus,
        agent: agentStatus,
      };
    },
  };
}
