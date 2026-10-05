import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import {
  assertEdition,
  replayContract,
  type ReplayEdition,
  type GameReplay,
} from "@pitch/domain";
import type { Storage } from "@pitch/db";

type BlobManifest = {
  encoding: "gzip-chunks-v1";
  sha256: string;
  chunks: number;
};
// A base64 chunk plus its DynamoDB keys fits in one 4 KiB read / four write units.
const chunkBytes = 2_048;
const serialize = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const digest = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const chunkKey = (key: string, hash: string, index: number) =>
  `${key}:blob:${hash}:chunk:${index}`;

type CompactEdition = Omit<ReplayEdition, "pitches"> & {
  pitches: Array<
    Omit<ReplayEdition["pitches"][number], "request"> & {
      request: Omit<
        ReplayEdition["pitches"][number]["request"],
        "pitcherSessionHistory" | "currentPaHistory"
      > & {
        pitcherSessionHistory: number[];
        currentPaHistory: number[];
      };
    }
  >;
};

function compact(edition: ReplayEdition) {
  if (edition.contract !== replayContract)
    return { format: "edition-v1", edition };
  // History events are exact references to earlier actuals, validated by assertEdition.
  return {
    format: "game-references-v1",
    edition: {
      ...edition,
      pitches: edition.pitches.map((item) => ({
        ...item,
        request: {
          ...item.request,
          pitcherSessionHistory: item.request.pitcherSessionHistory.map(
            (p) => p.gamePitchIndex,
          ),
          currentPaHistory: item.request.currentPaHistory.map(
            (p) => p.gamePitchIndex,
          ),
        },
      })),
    },
  };
}

function expand(saved: {
  format: string;
  edition: ReplayEdition | CompactEdition;
}): ReplayEdition {
  if (saved.format === "edition-v1") return saved.edition as ReplayEdition;
  if (saved.format !== "game-references-v1")
    throw new Error("Invalid replay storage format.");
  const edition = saved.edition as CompactEdition;
  return {
    ...edition,
    pitches: edition.pitches.map((item, index) => {
      const history = (indices: number[]) =>
        indices.map((i) => {
          if (
            !Number.isInteger(i) ||
            i < 0 ||
            i >= index ||
            edition.pitches[i]?.actual.gamePitchIndex !== i
          )
            throw new Error("Invalid replay history reference.");
          return edition.pitches[i].actual;
        });
      return {
        ...item,
        request: {
          ...item.request,
          pitcherSessionHistory: history(item.request.pitcherSessionHistory),
          currentPaHistory: history(item.request.currentPaHistory),
        },
      };
    }),
  };
}

async function saveBlob(storage: Storage, key: string, data: Buffer) {
  const manifest: BlobManifest = {
    encoding: "gzip-chunks-v1",
    sha256: digest(data),
    chunks: Math.ceil(data.length / chunkBytes),
  };
  for (let index = 0; index < manifest.chunks; index++) {
    const partKey = chunkKey(key, manifest.sha256, index);
    const value = data
      .subarray(index * chunkBytes, (index + 1) * chunkBytes)
      .toString("base64");
    if (
      !(await storage.write({ key: partKey, revision: 0, value }, null)) &&
      (await storage.read<string>(partKey))?.value !== value
    )
      throw new Error("Replay chunk differs from its saved data.");
  }
  // Publication is atomic: interrupted writes cannot expose an incomplete game.
  if (
    !(await storage.write({ key, revision: 0, value: manifest }, null)) &&
    !isDeepStrictEqual((await storage.read(key))?.value, manifest)
  )
    throw new Error("Replay manifest differs from its saved data.");
}

async function readBlob(
  storage: Storage,
  key: string,
  manifest: BlobManifest,
  maxOutputLength: number,
) {
  if (
    manifest.encoding !== "gzip-chunks-v1" ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    !Number.isInteger(manifest.chunks) ||
    manifest.chunks < 1 ||
    manifest.chunks > 4_096
  )
    throw new Error("Invalid replay manifest.");
  const parts: Buffer[] = [];
  // Storage owns throughput pacing; at most four reads are in flight.
  for (let offset = 0; offset < manifest.chunks; offset += 4) {
    parts.push(
      ...(await Promise.all(
        Array.from(
          { length: Math.min(4, manifest.chunks - offset) },
          async (_, i) => {
            const part = await storage.read<string>(
              chunkKey(key, manifest.sha256, offset + i),
            );
            if (!part || typeof part.value !== "string")
              throw new Error("Replay is incomplete.");
            const bytes = Buffer.from(part.value, "base64");
            if (bytes.length > chunkBytes)
              throw new Error("Replay chunk exceeds its storage limit.");
            return bytes;
          },
        ),
      )),
    );
  }
  const data = Buffer.concat(parts);
  if (digest(data) !== manifest.sha256)
    throw new Error("Replay checksum mismatch.");
  return JSON.parse(gunzipSync(data, { maxOutputLength }).toString("utf8"));
}

/** Save every forecast before publishing the immutable complete-game manifest. */
export async function saveEdition(storage: Storage, edition: ReplayEdition) {
  assertEdition(edition);
  const existing = await readEdition(storage, edition.id);
  if (existing) {
    if (!isDeepStrictEqual(existing, edition))
      throw new Error("The saved edition differs from the reviewed edition.");
    return;
  }
  await saveBlob(
    storage,
    `edition:${edition.id}`,
    gzipSync(serialize(compact(edition))),
  );
}

export async function readEdition(
  storage: Storage,
  id: string,
): Promise<ReplayEdition | null> {
  const key = `edition:${id}`;
  const record = await storage.read<ReplayEdition | BlobManifest>(key);
  if (!record) return null;
  const value = record.value;
  // Existing public replay URLs retain their saved at-bat data until a full game is published.
  const edition =
    "encoding" in value
      ? expand(await readBlob(storage, key, value, 64_000_000))
      : value;
  if (edition.id !== id) throw new Error("Replay edition identity mismatch.");
  assertEdition(edition);
  return edition;
}

/** Pin the normalized feed so upstream corrections cannot restart a worker batch. */
export async function saveReplaySource(storage: Storage, replay: GameReplay) {
  const data = gzipSync(JSON.stringify(replay));
  const key = `game-job:${replay.game.gamePk}:source:${digest(data)}`;
  const existing = await storage.read<BlobManifest>(key);
  if (!existing) await saveBlob(storage, key, data);
  else if (existing.value.sha256 !== digest(data))
    throw new Error("Game source identity mismatch.");
  return key;
}

export async function readReplaySource(
  storage: Storage,
  key: string,
): Promise<GameReplay> {
  const saved = await storage.read<BlobManifest>(key);
  if (!saved) throw new Error("Saved game source is missing.");
  if (!key.endsWith(`:${saved.value.sha256}`))
    throw new Error("Game source checksum mismatch.");
  return readBlob(storage, key, saved.value, 16_000_000);
}
