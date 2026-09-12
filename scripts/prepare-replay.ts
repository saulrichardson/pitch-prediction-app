import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { getStorage, type Storage, type StoredRecord } from "@pitch/db";
import {
  getGameReplay,
  getLatestMetsGame,
} from "../apps/web/src/lib/mlb-service";
import { predictPitch } from "../apps/web/src/lib/model-service";
import { prepareReplay, publishReplay } from "./lib/preparation";

async function main() {
  const { values } = parseArgs({
    options: {
      game: { type: "string" },
      output: { type: "string" },
      publish: { type: "boolean" },
      "model-artifact": { type: "string" },
    },
  });
  if (!values["model-artifact"])
    throw new Error(
      "--model-artifact must identify the immutable model/checkpoint, normalizer contract, and sample settings.",
    );
  if (!values.output && !values.publish)
    throw new Error(
      "Choose --output <file> for local review or --publish for durable publication.",
    );
  if (values.publish && process.env.STORAGE_MODE === "memory")
    throw new Error("Publication requires durable storage.");
  let storage: Storage;
  let release: (() => Promise<void>) | undefined;
  if (values.publish) storage = getStorage();
  else {
    const cache = path.resolve(".cache/replay-preparation");
    await mkdir(cache, { recursive: true });
    const lockPath = path.join(cache, "publisher.lock");
    const lock = await open(lockPath, "wx").catch(() => {
      throw new Error(
        "A local publisher is running. If it crashed, remove .cache/replay-preparation/publisher.lock before retrying.",
      );
    });
    release = async () => {
      await lock.close();
      const { unlink } = await import("node:fs/promises");
      await unlink(lockPath);
    };
    storage = {
      async read<T>(key: string) {
        try {
          return JSON.parse(
            await readFile(
              path.join(cache, `${encodeURIComponent(key)}.json`),
              "utf8",
            ),
          ) as StoredRecord<T>;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        }
      },
      async write<T>(record: StoredRecord<T>, expected: number | null) {
        const current = await this.read(record.key);
        if (
          expected === null ? Boolean(current) : current?.revision !== expected
        )
          return false;
        const file = path.join(cache, `${encodeURIComponent(record.key)}.json`);
        await writeFile(`${file}.tmp`, JSON.stringify(record));
        const { rename } = await import("node:fs/promises");
        await rename(`${file}.tmp`, file);
        return true;
      },
    };
  }
  try {
    const gamePk = values.game ?? (await getLatestMetsGame()).gamePk;
    const replay = await getGameReplay(gamePk);
    console.log(`Preparing ${replay.game.label}, ${replay.game.officialDate}`);
    const edition = await prepareReplay({
      replay,
      modelArtifact: values["model-artifact"],
      storage,
      predict: (request) => predictPitch(request, { timeoutMs: 60000 }),
      onProgress: (done, total) =>
        console.log(`Saved real forecast ${done}/${total}`),
    });
    if (values.output) {
      const output = path.resolve(values.output);
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify(edition, null, 2));
      console.log(`Review edition: ${output}`);
    }
    if (values.publish) {
      await publishReplay(storage, edition);
      console.log(
        `Published ${edition.id} (${edition.pitches.length} pitches).`,
      );
    }
  } finally {
    await release?.();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
