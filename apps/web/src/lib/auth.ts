import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { appSecretConfig } from "./env";

export const sessionCookieName = "pitch_lab_session";
const workspaceCookieName = "pitch_lab_workspace";

export type Session = {
  workspaceId: string;
  anonymous: true;
};

export async function getOrCreateSession(): Promise<Session> {
  const existing = await getSession();
  if (existing) return existing;
  const workspaceId = crypto.randomUUID();
  const token = signSession({ workspaceId, createdAt: Date.now() });
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, sessionCookieOptions());
  cookieStore.set(workspaceCookieName, workspaceId, sessionCookieOptions());
  return { workspaceId, anonymous: true };
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return { workspaceId: payload.workspaceId, anonymous: true };
}

function signSession(payload: { workspaceId: string; createdAt: number }): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySessionToken(token: string): { workspaceId: string; createdAt: number } | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { workspaceId?: string; createdAt?: number };
    if (!parsed.workspaceId || typeof parsed.createdAt !== "number") return null;
    if (Date.now() - parsed.createdAt > 1000 * 60 * 60 * 24 * 14) return null;
    return { workspaceId: parsed.workspaceId, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

function sessionSecret(): string {
  const secret = appSecretConfig().sessionSecret;
  const localFallback = "local-development-session-secret-change-in-aws";
  const knownUnsafeSecrets = new Set([
    localFallback,
    "change-this-session-secret-before-sharing"
  ]);

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET or APP_SECRET_JSON.sessionSecret is required in production.");
    }
    return localFallback;
  }

  if (process.env.NODE_ENV === "production" && (secret.length < 32 || knownUnsafeSecrets.has(secret))) {
    throw new Error("SESSION_SECRET must be a non-default secret with at least 32 characters in production.");
  }

  return secret;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  };
}
