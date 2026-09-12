import { NextResponse } from "next/server";
import { getStorageMode } from "@pitch/db";
import { getReplayService } from "@/lib/replay-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const edition = await (await getReplayService()).featured();
    return NextResponse.json(
      {
        status: "ok",
        storageMode: getStorageMode(),
        editionId: edition.id,
        pitchCount: edition.pitchCount,
      },
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
