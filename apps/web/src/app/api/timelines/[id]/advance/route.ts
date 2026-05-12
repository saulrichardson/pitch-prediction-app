import { advanceTimeline, loadTimeline, returnActual } from "@/lib/timeline-service";
import { badRequest, ok, readJsonObject, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";
import { toClientTimeline } from "@/lib/timeline-dto";
import { z } from "zod";

const advanceSchema = z.object({
  returnToActual: z.boolean().optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await withSession();
    const { id } = await context.params;
    const parsed = advanceSchema.safeParse(await readJsonObject(request, { optional: true }));
    if (!parsed.success) return badRequest("Advance options must be a JSON object.");
    const timeline = await loadTimeline(id, session.workspaceId);
    const next = parsed.data.returnToActual ? await returnActual(timeline) : await advanceTimeline(timeline);
    return ok({ timeline: toClientTimeline(next) });
  } catch (error) {
    return serverError(error);
  }
}
