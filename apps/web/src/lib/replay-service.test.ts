import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../../../../packages/db/src/storage/memory";
import { replayService } from "./replay-service";
import { fixtureEdition } from "../../../../tests/fixtures/replay";
async function setup() {
  const storage = new MemoryStorage();
  const edition = fixtureEdition();
  await storage.write(
    { key: `edition:${edition.id}`, revision: 0, value: edition },
    null,
  );
  await storage.write(
    { key: "featured", revision: 0, value: { editionId: edition.id } },
    null,
  );
  return {
    storage,
    edition,
    a: replayService(storage),
    b: replayService(storage),
  };
}
describe("durable replay sessions", () => {
  it("keeps sessions scoped to their workspace and resumes after a new service instance", async () => {
    const { a, b, edition } = await setup();
    const start = await a.start(edition.id, "one");
    const cmd = {
      id: crypto.randomUUID(),
      expectedRevision: 0,
      action: "reveal" as const,
    };
    const reveal = await a.command(start.id, "one", cmd);
    expect(await b.read(start.id, "one")).toEqual(reveal);
    expect(await b.start(edition.id, "one")).toEqual(reveal);
    await expect(b.read(start.id, "two")).rejects.toThrow("Start this replay");
    expect((await b.start(edition.id, "two")).phase).toBe("forecast");
  });
  it("allows one of two simultaneous commands and never overwrites the winner", async () => {
    const { a, b, edition } = await setup();
    await a.start(edition.id, "one");
    const results = await Promise.allSettled([
      a.command(edition.id, "one", {
        id: crypto.randomUUID(),
        expectedRevision: 0,
        action: "reveal",
      }),
      b.command(edition.id, "one", {
        id: crypto.randomUUID(),
        expectedRevision: 0,
        action: "reveal",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await a.read(edition.id, "one")).revision).toBe(1);
  });
  it("makes retry after response loss idempotent", async () => {
    const { a, b, edition } = await setup();
    await a.start(edition.id, "one");
    const cmd = {
      id: crypto.randomUUID(),
      expectedRevision: 0,
      action: "reveal" as const,
    };
    await a.command(edition.id, "one", cmd);
    expect((await b.command(edition.id, "one", cmd)).revision).toBe(1);
  });
});
