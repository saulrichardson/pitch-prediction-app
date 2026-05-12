import { getLatestMetsGame } from "@/lib/mlb-service";
import { ok, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";

export async function GET() {
  try {
    await withSession();
    return ok({ game: await getLatestMetsGame() });
  } catch (error) {
    return serverError(error);
  }
}
