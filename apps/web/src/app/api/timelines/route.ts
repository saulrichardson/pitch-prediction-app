import { z } from "zod";
import { createTimelineFromReplay } from "@/lib/timeline-service";
import { getGameReplay } from "@/lib/mlb-service";
import { badRequest, ok, readJson, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";
import { toClientTimeline } from "@/lib/timeline-dto";

const createTimelineSchema = z.object({
  gamePk: z.string()
});

export async function POST(request: Request) {
  try {
    const session = await withSession();
    const parsed = createTimelineSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest("gamePk is required.");
    const timeline = await createTimelineFromReplay(session.workspaceId, parsed.data.gamePk, () => getGameReplay(parsed.data.gamePk));
    return ok({ timeline: toClientTimeline(timeline) });
  } catch (error) {
    return serverError(error);
  }
}
