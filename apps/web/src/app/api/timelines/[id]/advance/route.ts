import { advanceTimeline, loadTimeline } from "@/lib/timeline-service";
import { badRequest, ok, readJsonObject, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";
import { toClientTimeline } from "@/lib/timeline-dto";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await withSession();
    const { id } = await context.params;
    const body = await readJsonObject(request, { optional: true });
    if (Object.keys(body).length > 0) return badRequest("Advance does not accept options.");
    const timeline = await loadTimeline(id, session.workspaceId);
    const next = await advanceTimeline(timeline);
    return ok({ timeline: toClientTimeline(next) });
  } catch (error) {
    return serverError(error);
  }
}
