import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  assertEdition,
  predictionRequestSchema,
  predictionResponseSchema,
  buildPredictionRequest,
  replayContract,
  selectFeaturedAtBat,
  editionSummary,
  type EditionSummary,
  type GameReplay,
  type PredictionRequest,
  type PredictionResponse,
  type ReplayEdition,
} from "@pitch/domain";
import type { Storage } from "@pitch/db";
import { gameEditionKey, catalogEditionsKey } from "./job";

export class PreparationBudgetError extends Error {
  constructor(readonly retryAt: string) {
    super(
      "Preparation budget reached. Existing published replays remain available.",
    );
  }
}

export async function preparationBudget(storage: Storage, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(0, 10);
  const record = await storage.read<{
    total: number;
    days: Record<string, number>;
  }>(`preparation-budget:${month}`);
  const current = record?.value ?? { total: 0, days: {} };
  const monthly = current.total >= 400;
  const limited = monthly || (current.days[day] ?? 0) >= 20;
  const reset = monthly
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    : new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
      );
  return { limited, retryAt: reset.toISOString() };
}

export async function consumePreparationBudget(
  storage: Storage,
  now = new Date(),
) {
  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(0, 10);
  const key = `preparation-budget:${month}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const record = await storage.read<{
      total: number;
      days: Record<string, number>;
    }>(key);
    const current = record?.value ?? { total: 0, days: {} };
    if (current.total >= 400 || (current.days[day] ?? 0) >= 20)
      throw new PreparationBudgetError(
        (await preparationBudget(storage, now)).retryAt,
      );
    if (
      await storage.write(
        {
          key,
          revision: (record?.revision ?? -1) + 1,
          value: {
            total: current.total + 1,
            days: { ...current.days, [day]: (current.days[day] ?? 0) + 1 },
          },
        },
        record?.revision ?? null,
      )
    )
      return;
  }
  throw new Error(
    "Another publisher is updating the budget. Retry preparation.",
  );
}

export async function prepareReplay(input: {
  replay: GameReplay;
  modelArtifact: string;
  storage: Storage;
  predict: (request: PredictionRequest) => Promise<PredictionResponse>;
  onProgress?: (done: number, total: number) => void | Promise<void>;
  now?: () => Date;
}): Promise<ReplayEdition> {
  const now = input.now ?? (() => new Date());
  if (!input.modelArtifact.trim())
    throw new Error("Model artifact identity is required.");
  const pitches = selectFeaturedAtBat(input.replay);
  await input.onProgress?.(0, pitches.length);
  const requests = pitches.map((actual) =>
    buildPredictionRequest({
      currentPitch: actual,
      history: input.replay.pitches.filter(
        (p) => p.gamePitchIndex < actual.gamePitchIndex,
      ),
      gameDate: input.replay.game.officialDate,
    }),
  );
  for (const request of requests) predictionRequestSchema.parse(request);
  const id = createHash("sha256")
    .update(
      JSON.stringify({
        contract: replayContract,
        artifact: input.modelArtifact,
        game: input.replay.game,
        pitches,
        requests,
      }),
    )
    .digest("hex");
  const existing = await input.storage.read<ReplayEdition>(`edition:${id}`);
  if (existing) {
    assertEdition(existing.value);
    return existing.value;
  }
  const lockKey = `preparation-lock:${id}`;
  const lock = await input.storage.read<{ until: number }>(lockKey);
  if (lock && lock.value.until > now().getTime())
    throw new Error("This replay is already being prepared.");
  const revision = (lock?.revision ?? -1) + 1;
  const until = now().getTime() + 10 * 60_000;
  if (
    !(await input.storage.write(
      { key: lockKey, revision, value: { until } },
      lock?.revision ?? null,
    ))
  )
    throw new Error("Another publisher claimed this replay.");
  const ownsLease = async () => {
    const lease = await input.storage.read<{ until: number }>(lockKey);
    if (lease?.revision !== revision || lease.value.until <= now().getTime())
      throw new Error(
        "Preparation lease expired. Retry to continue from saved predictions.",
      );
  };
  try {
    const items: ReplayEdition["pitches"] = [];
    for (const [index, actual] of pitches.entries()) {
      await ownsLease();
      const key = `forecast:${id}:${index}`;
      const saved = await input.storage.read<PredictionResponse>(key);
      let prediction = saved?.value;
      if (!prediction) {
        await consumePreparationBudget(input.storage, now());
        prediction = await input.predict(requests[index]);
        predictionResponseSchema.parse(prediction);
        await ownsLease();
        if (
          !(await input.storage.write(
            { key, revision: 0, value: prediction },
            null,
          ))
        )
          throw new Error("Forecast was already saved by another publisher.");
      }
      predictionResponseSchema.parse(prediction);
      items.push({ actual, request: requests[index], prediction });
      await input.onProgress?.(index + 1, pitches.length);
    }
    const edition: ReplayEdition = {
      id,
      contract: replayContract,
      game: input.replay.game,
      publishedAt: now().toISOString(),
      modelArtifact: input.modelArtifact,
      sourceUrl: `https://statsapi.mlb.com/api/v1.1/game/${input.replay.game.gamePk}/feed/live`,
      pitches: items,
    };
    assertEdition(edition);
    await ownsLease();
    if (
      !(await input.storage.write(
        { key: `edition:${id}`, revision: 0, value: edition },
        null,
      ))
    )
      throw new Error("Replay edition already exists.");
    return edition;
  } finally {
    await input.storage.write(
      { key: lockKey, revision: revision + 1, value: { until: 0 } },
      revision,
    );
  }
}

export async function publishReplay(storage: Storage, edition: ReplayEdition) {
  assertEdition(edition);
  const stored = await storage.read<ReplayEdition>(`edition:${edition.id}`);
  if (!stored) throw new Error("Save the complete edition before publication.");
  assertEdition(stored.value);
  if (!isDeepStrictEqual(stored.value, edition))
    throw new Error("The saved edition differs from the reviewed edition.");
  await indexGameEdition(storage, edition);
  const previous = await storage.read<{ editionId: string }>("featured");
  if (previous?.value.editionId === edition.id) return;
  if (
    !(await storage.write(
      {
        key: "featured",
        revision: (previous?.revision ?? -1) + 1,
        value: { editionId: edition.id },
      },
      previous?.revision ?? null,
    ))
  )
    throw new Error(
      "Featured replay changed during publication. Review and retry.",
    );
}

export async function indexGameEdition(
  storage: Storage,
  edition: ReplayEdition,
) {
  assertEdition(edition);
  const stored = await storage.read<ReplayEdition>(`edition:${edition.id}`);
  if (!stored || !isDeepStrictEqual(stored.value, edition))
    throw new Error("Save the complete edition before indexing the game.");
  const key = gameEditionKey(edition.game.gamePk);
  const previous = await storage.read<{ editionId: string }>(key);
  const summary = editionSummary(edition);
  if (
    previous?.value.editionId !== edition.id &&
    !(await storage.write(
      {
        key,
        revision: (previous?.revision ?? -1) + 1,
        value: { editionId: edition.id, summary },
      },
      previous?.revision ?? null,
    ))
  )
    throw new Error("The saved game replay changed during publication.");
  const dateKey = catalogEditionsKey(edition.game.officialDate);
  for (let attempt = 0; attempt < 6; attempt++) {
    const date = await storage.read<Record<string, EditionSummary>>(dateKey);
    if (date?.value[edition.game.gamePk]?.id === edition.id) return;
    if (
      await storage.write(
        {
          key: dateKey,
          revision: (date?.revision ?? -1) + 1,
          value: { ...date?.value, [edition.game.gamePk]: summary },
        },
        date?.revision ?? null,
      )
    )
      return;
  }
  throw new Error(
    "The date catalog changed during publication. Retry indexing.",
  );
}
