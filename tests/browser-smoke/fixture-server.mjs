import { createServer } from "node:http";
import {
  assignments,
  auditResponse,
  submissionSummary,
  teacherSession,
} from "./fixture.mjs";

const port = Number(process.env.PORT ?? 5175);
const allowedOrigin = process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:5174";

function send(response, status, body = null) {
  response.writeHead(status, {
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type,x-csrf-token",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-origin": allowedOrigin,
    "content-type": "application/json",
  });
  response.end(body === null ? "" : JSON.stringify(body));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "OPTIONS") {
    send(response, 204);
    return;
  }
  if (request.method === "GET" && url.pathname === "/health") {
    send(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "GET" && url.pathname === "/auth/me") {
    send(response, 200, teacherSession);
    return;
  }
  if (request.method === "GET" && url.pathname === "/assignments") {
    send(response, 200, assignments);
    return;
  }
  if (
    request.method === "GET" &&
    /^\/assignments\/[^/]+\/submissions$/.test(url.pathname)
  ) {
    send(response, 200, submissionSummary);
    return;
  }
  if (
    request.method === "GET" &&
    /^\/submissions\/[^/]+\/evaluation-audits$/.test(url.pathname)
  ) {
    send(response, 200, auditResponse);
    return;
  }
  if (request.method === "GET" && url.pathname === "/auth/users") {
    send(response, 200, []);
    return;
  }
  if (["POST", "PATCH"].includes(request.method ?? "")) {
    send(response, 204);
    return;
  }
  send(response, 404, { message: "Synthetic browser fixture route not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Synthetic browser fixture listening on http://127.0.0.1:${port}`);
});
