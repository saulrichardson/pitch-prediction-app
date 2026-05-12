import { getOrCreateSession, type Session } from "./auth";

export async function withSession(): Promise<Session> {
  return getOrCreateSession();
}
