import { assertInternalTimelineWorkerSecret, processTimelineStartJob } from "@/lib/timeline-job-service";
import { ok, serverError } from "@/lib/http";
import { toClientTimelineStartJob } from "@/lib/timeline-dto";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertInternalTimelineWorkerSecret(request.headers.get("x-internal-worker-secret"));
    const { id } = await context.params;
    const job = await processTimelineStartJob(id);
    return ok({ job: toClientTimelineStartJob(job) });
  } catch (error) {
    return serverError(error);
  }
}
