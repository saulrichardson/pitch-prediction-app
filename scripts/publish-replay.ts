import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { getStorage, getStorageMode } from "@pitch/db";
import { assertEdition, type ReplayEdition } from "@pitch/domain";
import { publishReplay, readEdition, saveEdition } from "@pitch/workflows";

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      edition: { type: "string" },
      check: { type: "boolean" },
    },
  });
  if (getStorageMode() === "memory")
    throw new Error("Publication requires durable storage.");
  const storage = getStorage();
  if (values.check) {
    const pointer = await storage.read<{ editionId: string }>("featured");
    if (!pointer)
      throw new Error(
        "Prepare and publish a replay before deploying the web application.",
      );
    const record = await readEdition(storage, pointer.value.editionId);
    if (!record) throw new Error("The featured replay is missing.");
    assertEdition(record);
    console.log(
      `Publication ready: ${record.id} (${record.pitches.length} pitches)`,
    );
    return;
  }
  if (Boolean(values.input) === Boolean(values.edition))
    throw new Error("Choose --input <reviewed-json> or --edition <saved-id>.");
  const edition = values.input
    ? (JSON.parse(await readFile(values.input, "utf8")) as ReplayEdition)
    : await readEdition(storage, values.edition!);
  if (!edition) throw new Error("Saved edition was not found.");
  assertEdition(edition);
  if (
    !/^\d+$/.test(edition.game.gamePk) ||
    edition.sourceUrl !==
      `https://statsapi.mlb.com/api/v1.1/game/${edition.game.gamePk}/feed/live`
  )
    throw new Error(
      "Test fixtures cannot be published. Use a reviewed MLB model edition.",
    );
  if (values.input) await saveEdition(storage, edition);
  await publishReplay(storage, edition);
  console.log(`Featured replay: ${edition.id}`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
