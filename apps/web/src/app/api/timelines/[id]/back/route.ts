import { loadTimeline, stepBackTimeline } from "@/lib/timeline-service";
import { ok, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";
import { toClientTimeline } from "@/lib/timeline-dto";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await withSession();
    const { id } = await context.params;
    const result = await stepBackTimeline(await loadTimeline(id, session.workspaceId));
    return ok({ ...result, timeline: toClientTimeline(result.timeline) });
  } catch (error) {
    return serverError(error);
  }
}
