import { describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "../../db/src/storage/memory";
import { fixtureEdition } from "../../../tests/fixtures/replay";
import { catalogService } from "./catalog";
import { indexGameEdition } from "./preparation";
import { jobKey, type GamePreparationJob } from "./job";
import type { CatalogGame } from "@pitch/domain";

const timestamp = new Date("2026-09-12T18:00:00Z");
export const catalogGame: CatalogGame = {
  gamePk: "823496",
  date: "2026-09-12",
  startsAt: "2026-09-12T17:00:00Z",
  away: { id: 1, abbreviation: "NYM", name: "New York Mets" },
  home: { id: 2, abbreviation: "NYY", name: "New York Yankees" },
  status: "complete",
  statusLabel: "Final",
  gameNumber: 1,
  doubleheader: false,
};
const setup = () => {
  const storage = new MemoryStorage();
  const schedule = vi.fn(async () => [
    catalogGame,
    { ...catalogGame, gamePk: "44", status: "live" as const },
  ]);
  return {
    storage,
    schedule,
    service: catalogService({ storage, schedule, now: () => timestamp }),
  };
};
describe("catalog and preparation requests", () => {
  it("validates the seven-day window and game membership before creating work", async () => {
    const { service, storage } = setup();
    await expect(service.list("2026-09-05")).rejects.toMatchObject({
      code: "date_out_of_range",
    });
    await expect(service.list("2026-02-30")).rejects.toMatchObject({
      code: "date_out_of_range",
    });
    await expect(service.list("2026-09-13")).rejects.toMatchObject({
      code: "date_out_of_range",
    });
    await expect(service.request("44", catalogGame.date)).rejects.toMatchObject(
      { code: "game_not_complete" },
    );
    await expect(
      service.request("999", catalogGame.date),
    ).rejects.toMatchObject({ code: "game_not_found" });
    expect(await storage.read(jobKey("44"))).toBeNull();
  });
  it("deduplicates concurrent starts and reuses the schedule across requests", async () => {
    const { service, storage, schedule } = setup();
    await service.list();
    const replies = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.request(catalogGame.gamePk, catalogGame.date),
      ),
    );
    expect(replies.every((r) => r.status === "queued")).toBe(true);
    expect((await storage.read(jobKey(catalogGame.gamePk)))?.revision).toBe(0);
    expect(schedule).toHaveBeenCalledTimes(1);
    const before = await storage.read(jobKey(catalogGame.gamePk));
    await service.request(catalogGame.gamePk, catalogGame.date);
    expect(await storage.read(jobKey(catalogGame.gamePk))).toEqual(before);
  });
  it("shows an actionable preparation limit across refresh without queuing model work", async () => {
    const { service, storage } = setup();
    await storage.write(
      {
        key: "preparation-budget:2026-09",
        revision: 0,
        value: { total: 20, days: { "2026-09-12": 20 } },
      },
      null,
    );
    const result = await service.request(catalogGame.gamePk, catalogGame.date);
    expect(result).toMatchObject({
      status: "failed",
      retryAt: "2026-09-13T00:00:00.000Z",
    });
    expect(
      (await service.status(catalogGame.gamePk, catalogGame.date)).replay,
    ).toEqual(result);
    expect(
      (await storage.read<GamePreparationJob>(jobKey(catalogGame.gamePk)))
        ?.value.status,
    ).toBe("failed");
  });
  it("lists validated saved editions without reading large prediction records or consuming inference", async () => {
    const { service, storage } = setup();
    const edition = fixtureEdition();
    edition.game.gamePk = catalogGame.gamePk;
    const dates = catalogGame.date;
    edition.game.officialDate = dates;
    edition.pitches = edition.pitches.map((p) => ({
      ...p,
      request: { ...p.request, gameDate: dates },
    }));
    await storage.write(
      { key: `edition:${edition.id}`, revision: 0, value: edition },
      null,
    );
    await indexGameEdition(storage, edition);
    const read = vi.spyOn(storage, "read");
    expect((await service.list()).games[0].replay).toMatchObject({
      status: "ready",
      edition: { id: edition.id },
    });
    expect(read.mock.calls.some(([key]) => key.startsWith("edition:"))).toBe(
      false,
    );
    expect((await service.request(catalogGame.gamePk, dates)).status).toBe(
      "ready",
    );
    expect(await storage.read(jobKey(catalogGame.gamePk))).toBeNull();
  });
  it("lets an interrupted job resume and keeps an in-flight game readable as the date window rolls", async () => {
    const { storage, service } = setup();
    await service.request(catalogGame.gamePk, catalogGame.date);
    const later = catalogService({
      storage,
      schedule: vi.fn(async () => [catalogGame]),
      now: () => new Date("2026-09-12T18:11:00Z"),
    });
    expect(
      (await later.status(catalogGame.gamePk, catalogGame.date)).replay.status,
    ).toBe("failed");
    const previous = (await storage.read<GamePreparationJob>(
      jobKey(catalogGame.gamePk),
    ))!;
    await later.request(catalogGame.gamePk, catalogGame.date);
    expect(
      (await storage.read<GamePreparationJob>(jobKey(catalogGame.gamePk)))!
        .value.requestId,
    ).not.toBe(previous.value.requestId);
    const rolled = catalogService({
      storage,
      schedule: vi.fn(),
      now: () => new Date("2026-09-19T18:00:00Z"),
    });
    expect(
      (await rolled.status(catalogGame.gamePk, catalogGame.date)).game.gamePk,
    ).toBe(catalogGame.gamePk);
    await expect(
      rolled.request(catalogGame.gamePk, catalogGame.date),
    ).rejects.toMatchObject({ code: "date_out_of_range" });
  });
});
