import { randomUUID } from "node:crypto";
import type { Storage } from "@pitch/db";
import {
  catalogWindow,
  gameDateSchema,
  gameIdSchema,
  type CatalogGame,
  type GameAvailability,
  type GameCatalog,
  type EditionSummary,
} from "@pitch/domain";
import {
  gameEditionKey,
  catalogEditionsKey,
  jobKey,
  preparationIsStale,
  type GamePreparationJob,
} from "./job";
import { preparationBudget } from "./preparation";
import { reserveCallerPreparation } from "./caller-budget";

export class CatalogError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

export function catalogService(input: {
  storage: Storage;
  schedule: (date: string) => Promise<CatalogGame[]>;
  now?: () => Date;
}) {
  const { storage } = input;
  const now = input.now ?? (() => new Date());
  function validateDate(date: string) {
    if (
      !gameDateSchema.safeParse(date).success ||
      !catalogWindow(now()).dates.includes(date)
    )
      throw new CatalogError(
        400,
        "date_out_of_range",
        "Choose a date from the last seven days.",
      );
  }
  async function schedule(date: string) {
    validateDate(date);
    const key = `schedule:${date}`;
    const cached = await storage.read<{
      fetchedAt: string;
      games: CatalogGame[];
    }>(key);
    if (
      cached &&
      now().getTime() - Date.parse(cached.value.fetchedAt) < 120_000
    )
      return cached.value.games;
    let games: CatalogGame[];
    try {
      games = await input.schedule(date);
    } catch {
      throw new CatalogError(
        503,
        "schedule_unavailable",
        "The game list couldn’t be reached. Try again.",
      );
    }
    await storage.write(
      {
        key,
        revision: (cached?.revision ?? -1) + 1,
        value: { fetchedAt: now().toISOString(), games },
        expiresAt: Math.floor(now().getTime() / 1000) + 8 * 86400,
      },
      cached?.revision ?? null,
    );
    return games;
  }
  async function availability(gamePk: string): Promise<GameAvailability> {
    const index = await storage.read<{
      editionId: string;
      summary: EditionSummary;
    }>(gameEditionKey(gamePk));
    if (index) {
      if (
        index.value.summary.game.gamePk !== gamePk ||
        index.value.summary.id !== index.value.editionId
      )
        throw new Error("Game replay index is invalid.");
      return { status: "ready", edition: index.value.summary };
    }
    const job = (await storage.read<GamePreparationJob>(jobKey(gamePk)))?.value;
    if (!job) return { status: "available" };
    if (preparationIsStale(job, now()))
      return {
        status: "failed",
        message:
          "Preparation was interrupted. Your saved forecasts can be resumed.",
        retryAt: null,
        retryable: true,
      };
    if (job.status === "failed")
      return {
        status: "failed",
        message: job.message,
        retryAt: job.retryAt,
        retryable: job.retryable,
      };
    if (job.status === "ready")
      throw new Error("Prepared game has no edition index.");
    return { status: job.status, completed: job.completed, total: job.total };
  }
  async function game(gamePk: string, date: string) {
    if (!gameIdSchema.safeParse(gamePk).success)
      throw new CatalogError(400, "invalid_game", "Choose a listed MLB game.");
    const found = (await schedule(date)).find((item) => item.gamePk === gamePk);
    if (!found)
      throw new CatalogError(
        404,
        "game_not_found",
        "This game is not on the selected date.",
      );
    return found;
  }
  return {
    async list(date = catalogWindow(now()).end): Promise<GameCatalog> {
      const games = await schedule(date);
      const editions =
        (
          await storage.read<Record<string, EditionSummary>>(
            catalogEditionsKey(date),
          )
        )?.value ?? {};
      return {
        window: catalogWindow(now()),
        date,
        games: games.map((item) => ({
          ...item,
          replay:
            item.status === "complete" && editions[item.gamePk]
              ? { status: "ready" as const, edition: editions[item.gamePk] }
              : { status: "available" as const },
        })),
      };
    },
    async status(gamePk: string, date: string) {
      if (
        gameIdSchema.safeParse(gamePk).success &&
        gameDateSchema.safeParse(date).success &&
        date < catalogWindow(now()).start
      ) {
        const cached = await storage.read<{ games: CatalogGame[] }>(
          `schedule:${date}`,
        );
        const selected = cached?.value.games.find(
          (item) => item.gamePk === gamePk,
        );
        const replay = await availability(gamePk);
        if (selected && replay.status !== "available")
          return { game: selected, replay };
      }
      const selected = await game(gamePk, date);
      return { game: selected, replay: await availability(gamePk) };
    },
    async request(gamePk: string, date: string, callerId: string) {
      const selected = await game(gamePk, date);
      if (selected.status !== "complete")
        throw new CatalogError(
          409,
          "game_not_complete",
          "This game will be available after it finishes.",
        );
      const current = await availability(gamePk);
      if (
        current.status === "ready" ||
        current.status === "queued" ||
        current.status === "preparing"
      )
        return current;
      if (
        current.status === "failed" &&
        (!current.retryable ||
          (current.retryAt && Date.parse(current.retryAt) > now().getTime()))
      )
        return current;
      const budget = await preparationBudget(storage, now());
      const key = jobKey(gamePk);
      const previous = await storage.read<GamePreparationJob>(key);
      if (
        previous &&
        (previous.value.status === "queued" ||
          previous.value.status === "preparing") &&
        !preparationIsStale(previous.value, now())
      )
        return availability(gamePk);
      if (!budget.limited) {
        const caller = await reserveCallerPreparation(
          storage,
          callerId,
          gamePk,
          now(),
        );
        if (!caller.allowed)
          throw new CatalogError(
            429,
            "caller_preparation_limit",
            "This connection has prepared several games. Try again after the reset.",
            { retryAt: caller.retryAt },
          );
      }
      const timestamp = now().toISOString();
      const job: GamePreparationJob = {
        gamePk,
        date,
        requestId: randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
        completed: previous?.value.completed ?? 0,
        total: previous?.value.total ?? null,
        ...(previous?.value.model ? { model: previous.value.model } : {}),
        ...(budget.limited
          ? {
              status: "failed" as const,
              message:
                "New replay preparation is paused until the next preparation window. Saved games are still available.",
              retryAt: budget.retryAt,
              retryable: true,
            }
          : { status: "queued" as const }),
      };
      // The durable write is the enqueue. DynamoDB Streams dispatches this exact request.
      await storage.write(
        { key, revision: (previous?.revision ?? -1) + 1, value: job },
        previous?.revision ?? null,
      );
      return availability(gamePk);
    },
  };
}
