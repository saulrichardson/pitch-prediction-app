import { NextResponse } from "next/server";
import { getReplayService } from "@/lib/replay-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await (await getReplayService()).featured();
    return NextResponse.json(
      { status: "ok" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "readiness_failed",
        message:
          error instanceof Error ? error.message : "Unknown readiness failure",
      }),
    );
    return NextResponse.json(
      { status: "unavailable", code: "replay_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
