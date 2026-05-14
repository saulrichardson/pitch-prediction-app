import { NextResponse } from "next/server";
import { z } from "zod";
import { createTimelineStartJob } from "@/lib/timeline-job-service";
import { badRequest, readJson, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";
import { toClientTimelineStartJob } from "@/lib/timeline-dto";

const createTimelineJobSchema = z.object({
  gamePk: z.string()
});

export async function POST(request: Request) {
  try {
    const session = await withSession();
    const parsed = createTimelineJobSchema.safeParse(await readJson(request));
    if (!parsed.success) return badRequest("gamePk is required.");
    const job = await createTimelineStartJob(session.workspaceId, parsed.data.gamePk);
    return NextResponse.json({ job: toClientTimelineStartJob(job) }, { status: 202 });
  } catch (error) {
    return serverError(error);
  }
}
