import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Response } from "express";

export const SESSION_COOKIE = "tide_session";

export type SessionPayload = {
  userId: string;
  sessionVersion: number;
  csrfToken: string;
  expiresAt: number;
};

type SessionOptions = {
  secret?: string;
  secure?: boolean;
  ttlMilliseconds?: number;
};

function readCookie(header: string | undefined, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

export function createSessionService(options: SessionOptions = {}) {
  const secret = options.secret?.trim() ?? "";
  const secure = options.secure ?? false;
  const ttlMilliseconds = options.ttlMilliseconds ?? 8 * 60 * 60 * 1000;

  function sign(value: string) {
    return createHmac("sha256", secret).update(value).digest("base64url");
  }

  function assertConfigured() {
    if (secret.length < 32) {
      throw new Error("AUTH_SECRET must contain at least 32 characters.");
    }
  }

  function issue(userId: string, sessionVersion: number) {
    assertConfigured();
    const payload: SessionPayload = {
      userId,
      sessionVersion,
      csrfToken: randomBytes(24).toString("base64url"),
      expiresAt: Date.now() + ttlMilliseconds,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return { payload, cookieValue: `${encoded}.${sign(encoded)}` };
  }

  function verify(cookieHeader: string | undefined): SessionPayload | null {
    if (secret.length < 32) return null;
    const cookie = readCookie(cookieHeader, SESSION_COOKIE);
    const [encoded, signature] = cookie?.split(".") ?? [];
    if (!encoded || !signature) return null;

    const expected = sign(encoded);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return null;
    }

    try {
      const payload = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as Partial<SessionPayload>;
      if (
        typeof payload.userId !== "string" ||
        !Number.isInteger(payload.sessionVersion) ||
        Number(payload.sessionVersion) < 0 ||
        typeof payload.csrfToken !== "string" ||
        typeof payload.expiresAt !== "number" ||
        payload.expiresAt <= Date.now()
      ) {
        return null;
      }
      return payload as SessionPayload;
    } catch {
      return null;
    }
  }

  function setCookie(response: Response, cookieValue: string) {
    response.cookie(SESSION_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: ttlMilliseconds,
      path: "/",
    });
  }

  function clearCookie(response: Response) {
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    });
  }

  return {
    configured: secret.length >= 32,
    issue,
    verify,
    setCookie,
    clearCookie,
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
