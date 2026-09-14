import { describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "../../db/src/storage/memory";
import {
  fixtureEdition,
  fixturePrediction,
} from "../../../tests/fixtures/replay";
import { catalogService } from "./catalog";
import { gamePreparationWorker } from "./game-preparation";
import { jobKey, type GamePreparationJob } from "./job";
import type { CatalogGame } from "@pitch/domain";

const caller = "c".repeat(64);

function setup() {
  const edition = fixtureEdition();
  edition.game.gamePk = "42";
  let timestamp = new Date("2026-09-12T18:00:00Z");
  const now = () => timestamp;
  const storage = new MemoryStorage();
  const game: CatalogGame = {
    gamePk: "42",
    date: edition.game.officialDate,
    startsAt: "2026-09-09T23:00:00Z",
    away: { id: 1, abbreviation: "NYM", name: "Mets" },
    home: { id: 2, abbreviation: "MIA", name: "Marlins" },
    gameNumber: 1,
    doubleheader: false,
    status: "complete",
    statusLabel: "Final",
  };
  const service = catalogService({
    storage,
    schedule: async () => [game],
    now,
  });
  const predict = vi.fn(async () => fixturePrediction());
  const model = { target: "model:12", artifact: "test-immutable-model:12" };
  const resolveModel = vi.fn(async () => model);
  const loadGame = vi.fn(async () => ({
    game: edition.game,
    pitches: edition.pitches.map((p) => p.actual),
  }));
  const run = gamePreparationWorker({
    storage,
    loadGame,
    resolveModel,
    predict,
    now,
  });
  const job = async () =>
    (await storage.read<GamePreparationJob>(jobKey("42")))!.value;
  return {
    edition,
    storage,
    service,
    predict,
    model,
    resolveModel,
    loadGame,
    run,
    job,
    advance: () => {
      timestamp = new Date(timestamp.getTime() + 61_000);
    },
  };
}
describe("durable game preparation", () => {
  it("prepares once, saves real progress, ignores duplicate deliveries, and keeps the featured game unchanged", async () => {
    const s = setup();
    await s.storage.write(
      { key: "featured", revision: 0, value: { editionId: "old-featured" } },
      null,
    );
    await s.service.request("42", s.edition.game.officialDate, caller);
    const id = (await s.job()).requestId;
    await s.run("42", id);
    expect(await s.job()).toMatchObject({
      status: "ready",
      completed: 4,
      total: 4,
    });
    expect(
      (await s.service.status("42", s.edition.game.officialDate)).replay.status,
    ).toBe("ready");
    expect(
      (await s.storage.read<{ editionId: string }>("featured"))?.value
        .editionId,
    ).toBe("old-featured");
    await s.run("42", id);
    expect(s.predict).toHaveBeenCalledTimes(4);
    expect(s.resolveModel).toHaveBeenCalledTimes(1);
  });
  it("resumes saved forecasts using the same immutable model after a failure and ignores an old retry", async () => {
    const s = setup();
    s.predict
      .mockResolvedValueOnce(fixturePrediction(0))
      .mockRejectedValueOnce(new Error("connection interrupted"));
    await s.service.request("42", s.edition.game.officialDate, caller);
    const previous = (await s.job()).requestId;
    await s.run("42", previous);
    expect(await s.job()).toMatchObject({
      status: "failed",
      completed: 1,
      total: 4,
      model: s.model,
    });
    expect(await s.storage.read("game-edition:42")).toBeNull();
    s.advance();
    await s.service.request("42", s.edition.game.officialDate, caller);
    await s.run("42", previous);
    expect(s.predict).toHaveBeenCalledTimes(2);
    await s.run("42", (await s.job()).requestId);
    expect(s.predict).toHaveBeenCalledTimes(5);
    expect(s.resolveModel).toHaveBeenCalledTimes(1);
    expect((await s.job()).status).toBe("ready");
  });
  it("rejects unusable or mismatched feeds before invoking the model", async () => {
    const s = setup();
    s.loadGame.mockResolvedValue({ game: s.edition.game, pitches: [] });
    await s.service.request("42", s.edition.game.officialDate, caller);
    await s.run("42", (await s.job()).requestId);
    expect(await s.job()).toMatchObject({ status: "failed", retryable: false });
    expect(s.predict).not.toHaveBeenCalled();
    expect(s.resolveModel).not.toHaveBeenCalled();
  });
  it("gives concurrent delivery of the same request one owner", async () => {
    const s = setup();
    await s.service.request("42", s.edition.game.officialDate, caller);
    const id = (await s.job()).requestId;
    await Promise.all([s.run("42", id), s.run("42", id)]);
    expect(s.predict).toHaveBeenCalledTimes(4);
    expect((await s.job()).status).toBe("ready");
  });
});
