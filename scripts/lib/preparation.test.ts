import { describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "../../packages/db/src/storage/memory";
import { fixtureEdition, fixturePrediction } from "../../tests/fixtures/replay";
import {
  consumePreparationBudget,
  prepareReplay,
  publishReplay,
} from "@pitch/workflows";

const fixture = fixtureEdition();
const replay = {
  game: fixture.game,
  pitches: fixture.pitches.map((item) => item.actual),
};
const now = () => new Date("2026-09-12T00:00:00Z");

describe("replay preparation and publication", () => {
  it("resumes partial work without repeating successful inference and publishes only complete editions", async () => {
    const storage = new MemoryStorage();
    const predict = vi
      .fn()
      .mockResolvedValueOnce(fixturePrediction(0))
      .mockRejectedValueOnce(new Error("Model timed out"));
    const input = {
      replay,
      modelArtifact: "test-revision",
      storage,
      predict,
      now,
    };
    await expect(prepareReplay(input)).rejects.toThrow("Model timed out");
    expect(await storage.read("featured")).toBeNull();
    predict.mockResolvedValue(fixturePrediction(1));
    const edition = await prepareReplay(input);
    expect(predict).toHaveBeenCalledTimes(5); // Four successes, one failed attempt.
    expect(edition.pitches[0].prediction.id).toBe("test-only-prediction-0");
    await publishReplay(storage, edition);
    expect(
      (await storage.read<{ editionId: string }>("featured"))?.value.editionId,
    ).toBe(edition.id);
    await prepareReplay(input);
    expect(predict).toHaveBeenCalledTimes(5);
  });

  it("excludes concurrent publishers and never caches invalid predictions", async () => {
    const storage = new MemoryStorage();
    let settle!: (value: ReturnType<typeof fixturePrediction>) => void;
    const predict = vi.fn(
      () =>
        new Promise<ReturnType<typeof fixturePrediction>>((resolve) => {
          settle = resolve;
        }),
    );
    const input = {
      replay,
      modelArtifact: "test-revision",
      storage,
      predict,
      now,
    };
    const running = prepareReplay(input);
    const rejected = expect(running).rejects.toThrow();
    await vi.waitFor(() => expect(predict).toHaveBeenCalledTimes(1));
    await expect(prepareReplay(input)).rejects.toThrow(
      "already being prepared",
    );
    settle({ ...fixturePrediction(), pitchMix: [] });
    await rejected;
    predict.mockImplementation(async () => fixturePrediction());
    await prepareReplay(input);
    expect(predict).toHaveBeenCalledTimes(5);
  });

  it("enforces one atomic daily and monthly model budget", async () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < 20; i++) await consumePreparationBudget(storage, now());
    await expect(consumePreparationBudget(storage, now())).rejects.toThrow(
      "budget reached",
    );
    const record = await storage.read<{
      total: number;
      days: Record<string, number>;
    }>("preparation-budget:2026-09");
    expect(record?.value).toEqual({ total: 20, days: { "2026-09-12": 20 } });
    await storage.write(
      {
        ...record!,
        revision: record!.revision + 1,
        value: { total: 400, days: {} },
      },
      record!.revision,
    );
    await expect(
      consumePreparationBudget(storage, new Date("2026-09-13T00:00:00Z")),
    ).rejects.toThrow("budget reached");
  });

  it("keeps the featured edition intact after an invalid publication", async () => {
    const storage = new MemoryStorage();
    await storage.write(
      { key: "featured", revision: 0, value: { editionId: "previous" } },
      null,
    );
    await expect(publishReplay(storage, fixture)).rejects.toThrow(
      "Save the complete edition",
    );
    expect(
      (await storage.read<{ editionId: string }>("featured"))?.value.editionId,
    ).toBe("previous");
  });
  it("publishes identical content after a database reorders JSON keys", async () => {
    const storage = new MemoryStorage();
    const { pitches, ...metadata } = fixture;
    const reordered = { pitches, ...metadata };
    await storage.write(
      { key: `edition:${fixture.id}`, revision: 0, value: reordered },
      null,
    );
    await publishReplay(storage, fixture);
    expect(
      (await storage.read<{ editionId: string }>("featured"))?.value.editionId,
    ).toBe(fixture.id);
  });
});
