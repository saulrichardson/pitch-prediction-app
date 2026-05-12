import { generatePitch, loadTimeline } from "@/lib/timeline-service";
import { badRequest, ok, readJsonObject, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";
import { toClientTimeline } from "@/lib/timeline-dto";
import { z } from "zod";

const generatedPitchSchema = z.object({
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
    const { id } = await context.params;
    const body = await readJsonObject(request, { optional: true });
    const parsed = Object.keys(body).length === 0
      ? { success: true as const, data: undefined }
      : generatedPitchSchema.safeParse(body);
    if (!parsed.success) return badRequest("Generated pitch fields are invalid.");
    return ok({ timeline: toClientTimeline(await generatePitch(await loadTimeline(id, session.workspaceId), parsed.data)) });
  } catch (error) {
    return serverError(error);
  }
}
