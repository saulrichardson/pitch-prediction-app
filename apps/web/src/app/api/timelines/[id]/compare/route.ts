import { compareTimeline, loadTimeline } from "@/lib/timeline-service";
import { ok, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await withSession();
    const url = new URL(request.url);
    const { id } = await context.params;
    return ok({ comparison: compareTimeline(await loadTimeline(id, session.workspaceId), url.searchParams.get("against") ?? undefined) });
  } catch (error) {
    return serverError(error);
  }
}
