import { loadTimelineStartJobResult } from "@/lib/timeline-job-service";
import { ok, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";
import { toClientTimeline, toClientTimelineStartJob } from "@/lib/timeline-dto";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await withSession();
    const { id } = await context.params;
    const result = await loadTimelineStartJobResult(id, session.workspaceId);
    return ok({
      job: toClientTimelineStartJob(result.job),
      timeline: result.timeline ? toClientTimeline(result.timeline) : undefined
    });
  } catch (error) {
    return serverError(error);
  }
}
