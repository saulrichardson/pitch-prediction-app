import { getOrCreateSession } from "@/lib/auth";
import { ok, serverError } from "@/lib/http";

export async function GET() {
  try {
    return ok({ session: await getOrCreateSession() });
  } catch (error) {
    return serverError(error);
  }
}
