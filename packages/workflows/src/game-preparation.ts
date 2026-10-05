import type { Storage } from "@pitch/db";
import {
  selectFullGame,
  type GameReplay,
  type PredictionRequest,
  type PredictionResponse,
} from "@pitch/domain";
import {
  indexGameEdition,
  PreparationBudgetError,
  PreparationYield,
  prepareReplay,
} from "./preparation";
import { saveReplaySource, readReplaySource } from "./edition-store";
import { jobKey, type GamePreparationJob, type ModelIdentity } from "./job";

export function gamePreparationWorker(input: {
  storage: Storage;
  loadGame: (id: string) => Promise<GameReplay>;
  resolveModel: () => Promise<ModelIdentity>;
  predict: (
    request: PredictionRequest,
    model: ModelIdentity,
  ) => Promise<PredictionResponse>;
  now?: () => Date;
  shouldYield?: () => boolean;
  log?: (event: Record<string, unknown>) => void;
}) {
  const now = input.now ?? (() => new Date());
  return async (gamePk: string, requestId: string) => {
    const key = jobKey(gamePk);
    let record = await input.storage.read<GamePreparationJob>(key);
    if (
      !record ||
      record.value.requestId !== requestId ||
      record.value.status !== "queued"
    )
      return;
    const update = async (value: GamePreparationJob) => {
      const next = {
        key,
        revision: record!.revision + 1,
        value: { ...value, updatedAt: now().toISOString() },
      };
      if (!(await input.storage.write(next, record!.revision)))
        throw new Error("Preparation request changed ownership.");
      record = next;
    };
    const claimed = {
      key,
      revision: record.revision + 1,
      value: {
        ...record.value,
        status: "preparing" as const,
        updatedAt: now().toISOString(),
      },
    };
    if (!(await input.storage.write(claimed, record.revision))) return;
    record = claimed;
    input.log?.({ event: "game_preparation_started", gamePk, requestId });
    let phase: "load" | "select" | "predict" = "load";
    try {
      const replay = record.value.sourceKey
        ? await readReplaySource(input.storage, record.value.sourceKey)
        : await input.loadGame(gamePk);
      if (
        replay.game.gamePk !== gamePk ||
        replay.game.officialDate !== record.value.date
      )
        throw new Error("Game feed does not match the requested date.");
      phase = "select";
      selectFullGame(replay);
      const sourceKey =
        record.value.sourceKey ??
        (await saveReplaySource(input.storage, replay));
      phase = "predict";
      const model = record.value.model ?? (await input.resolveModel());
      await update({ ...record.value, model, sourceKey, status: "preparing" });
      const edition = await prepareReplay({
        replay,
        storage: input.storage,
        modelArtifact: model.artifact,
        now,
        shouldYield: input.shouldYield,
        predict: (request) => input.predict(request, model),
        onProgress: async (completed, total) => {
          if (
            completed <= record!.value.completed &&
            total === record!.value.total
          )
            return;
          await update({
            ...record!.value,
            completed: Math.max(record!.value.completed, completed),
            total,
            status: "preparing",
          });
        },
      });
      await indexGameEdition(input.storage, edition);
      await update({
        ...record.value,
        completed: edition.pitches.length,
        total: edition.pitches.length,
        status: "ready",
        editionId: edition.id,
      });
      input.log?.({
        event: "game_preparation_completed",
        gamePk,
        requestId,
        editionId: edition.id,
        pitches: edition.pitches.length,
      });
    } catch (error) {
      if (error instanceof PreparationYield) {
        await update({ ...record.value, status: "queued" });
        input.log?.({
          event: "game_preparation_continued",
          gamePk,
          completed: record.value.completed,
          total: record.value.total,
        });
        return;
      }
      input.log?.({
        event: "game_preparation_failed",
        gamePk,
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      await update({
        ...record.value,
        status: "failed",
        message:
          error instanceof PreparationBudgetError
            ? "New replay preparation is paused until the next preparation window. Saved games are still available."
            : phase === "select"
              ? "This game does not have a complete recorded pitch sequence."
              : "This replay couldn’t be prepared. Try again to resume the saved forecasts.",
        retryable: phase !== "select",
        retryAt:
          error instanceof PreparationBudgetError
            ? error.retryAt
            : phase === "select"
              ? null
              : new Date(now().getTime() + 60_000).toISOString(),
      });
    }
  };
}
