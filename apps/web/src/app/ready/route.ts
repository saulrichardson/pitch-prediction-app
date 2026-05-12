import { NextResponse } from "next/server";
import { checkDynamoDb, getReadyDb, getStorageMode, type StorageMode } from "@pitch/db";
import { modelHealth } from "@/lib/model-service";

export async function GET() {
  const model = await modelHealth();
  const storage = await storageHealth();
  const ready = storage.status !== "unavailable" && model === "ok";

  return NextResponse.json(
    {
      status: ready ? "ok" : "unavailable",
      storageMode: storage.mode,
      database: storage.status,
      model
    },
    { status: ready ? 200 : 503 }
  );
}

async function storageHealth(): Promise<{ mode: StorageMode | null; status: "configured" | "memory" | "unavailable" }> {
  try {
    const mode = getStorageMode();
    if (mode === "memory") return { mode, status: "memory" };
    if (mode === "dynamodb") return { mode, status: await checkDynamoDb() ? "configured" : "unavailable" };
    return { mode, status: await getReadyDb() ? "configured" : "unavailable" };
  } catch {
    return { mode: null, status: "unavailable" };
  }
}
