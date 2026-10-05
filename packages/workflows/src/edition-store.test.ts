import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../../db/src/storage/memory";
import { fixtureGameEdition } from "../../../tests/fixtures/replay";
import {
  readEdition,
  saveEdition,
  saveReplaySource,
  readReplaySource,
} from "./edition-store";

describe("whole game edition storage", () => {
  it("round trips a game exceeding a DynamoDB item without changing requests or forecasts", async () => {
    const edition = fixtureGameEdition(12);
    expect(Buffer.byteLength(JSON.stringify(edition))).toBeGreaterThan(400_000);
    const storage = new MemoryStorage();
    await saveEdition(storage, edition);
    expect(await readEdition(storage, edition.id)).toEqual(edition);
    await saveEdition(storage, edition);
    const saved = await storage.read(`edition:${edition.id}`);
    expect(saved?.value).toMatchObject({
      encoding: "gzip-chunks-v1",
    });
    expect(Buffer.byteLength(JSON.stringify(saved))).toBeLessThan(256_000);
  });
  it("rejects changed or missing chunks rather than exposing a partial game", async () => {
    const edition = fixtureGameEdition();
    const storage = new MemoryStorage();
    await saveEdition(storage, edition);
    const manifest = await storage.read<{ sha256: string }>(
      `edition:${edition.id}`,
    );
    const key = `edition:${edition.id}:blob:${manifest!.value.sha256}:chunk:0`;
    await storage.write(
      { key, revision: 1, value: Buffer.from("corrupt").toString("base64") },
      0,
    );
    await expect(readEdition(storage, edition.id)).rejects.toThrow("checksum");
  });
  it("resumes interrupted storage without exposing a partial game", async () => {
    const edition = fixtureGameEdition(12);
    const storage = new MemoryStorage();
    const write = storage.write.bind(storage);
    let writes = 0;
    storage.write = async (record, revision) => {
      expect(Buffer.byteLength(JSON.stringify(record)) + 200).toBeLessThan(
        4096,
      );
      if (++writes === 3) throw new Error("Interrupted");
      return write(record, revision);
    };
    await expect(saveEdition(storage, edition)).rejects.toThrow("Interrupted");
    expect(await readEdition(storage, edition.id)).toBeNull();
    storage.write = write;
    await saveEdition(storage, edition);
    expect(await readEdition(storage, edition.id)).toEqual(edition);
  });
  it("pins source data using bounded items and preserves identity across continuations", async () => {
    const edition = fixtureGameEdition(12);
    const replay = {
      game: edition.game,
      pitches: edition.pitches.map((p) => p.actual),
    };
    const storage = new MemoryStorage();
    const key = await saveReplaySource(storage, replay);
    const restored = await readReplaySource(storage, key);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(replay));
    expect(await saveReplaySource(storage, restored)).toBe(key);
  });
});
