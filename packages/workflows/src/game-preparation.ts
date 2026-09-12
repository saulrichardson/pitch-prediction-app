import type { Storage } from "@pitch/db";
import {
  selectFeaturedAtBat,
  type GameReplay,
  type PredictionRequest,
  type PredictionResponse,
} from "@pitch/domain";
import {
  indexGameEdition,
  PreparationBudgetError,
  prepareReplay,
} from "./preparation";
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
      const replay = await input.loadGame(gamePk);
      if (
        replay.game.gamePk !== gamePk ||
        replay.game.officialDate !== record.value.date
      )
        throw new Error("Game feed does not match the requested date.");
      phase = "select";
      selectFeaturedAtBat(replay);
      phase = "predict";
      const model = record.value.model ?? (await input.resolveModel());
      await update({ ...record.value, model, status: "preparing" });
      const edition = await prepareReplay({
        replay,
        storage: input.storage,
        modelArtifact: model.artifact,
        now,
        predict: (request) => input.predict(request, model),
        onProgress: async (completed, total) =>
          update({ ...record!.value, completed, total, status: "preparing" }),
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
              ? "This game has no complete at-bat with enough pitch data for a replay."
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
