import { getGameReplay } from "@/lib/mlb-service";
import { ok, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";
import { toReplaySummary } from "@/lib/timeline-dto";

export async function GET(_request: Request, context: { params: Promise<{ gamePk: string }> }) {
  try {
    await withSession();
    const { gamePk } = await context.params;
    return ok({ replay: toReplaySummary(await getGameReplay(gamePk)) });
  } catch (error) {
    return serverError(error);
  }
}
