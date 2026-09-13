import { z } from "zod";
import { NextResponse } from "next/server";
import { getReplayService } from "@/lib/replay-service";
import {
  badRequest,
  ok,
  readJsonObject,
  serverError,
  assertSameOrigin,
} from "@/lib/http";
import { withSession } from "@/lib/route-params";

export async function GET() {
  try {
    // This summary is public and contains no cursor, actuals, or session data.
    // Private replay reads and every mutation continue to use no-store.
    return NextResponse.json(
      { edition: await (await getReplayService()).featured() },
      { headers: { "cache-control": "public, max-age=0, s-maxage=30" } },
    );
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = z
      .object({ editionId: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .safeParse(await readJsonObject(request));
    if (!body.success) return badRequest("Choose an available replay.");
    const session = await withSession();
    return ok({
      replay: await (
        await getReplayService()
      ).start(body.data.editionId, session.workspaceId),
    });
  } catch (error) {
    return serverError(error);
  }
}
