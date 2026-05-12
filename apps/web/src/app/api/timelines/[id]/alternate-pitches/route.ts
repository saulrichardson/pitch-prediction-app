import { z } from "zod";
import { addAlternatePitch, loadTimeline } from "@/lib/timeline-service";
import { badRequest, ok, readJson, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";
import { toClientTimeline } from "@/lib/timeline-dto";

const alternateSchema = z.object({
  pitchType: z.enum(["FF", "SI", "SL", "CH", "CU", "FC", "FS", "Other"]),
  location: z.enum([
    "Up In",
    "Up Middle",
    "Up Away",
    "Middle In",
    "Middle",
    "Middle Away",
    "Low In",
    "Low Middle",
    "Low Away",
    "Chase Low",
    "Chase Away",
    "Waste"
  ]),
  result: z.enum(["ball", "called_strike", "whiff", "foul", "ball_in_play", "hit_by_pitch"])
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await withSession();
    const parsed = alternateSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest("Pitch type, location, and result are required.");
    const { id } = await context.params;
    return ok({ timeline: toClientTimeline(await addAlternatePitch(await loadTimeline(id, session.workspaceId), parsed.data)) });
  } catch (error) {
    return serverError(error);
  }
}
