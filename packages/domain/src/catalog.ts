import { z } from "zod";
import type { EditionSummary } from "./replay";

export const gameIdSchema = z.string().regex(/^\d{1,10}$/);
export const gameDateSchema = z.iso.date();
export const catalogDays = 7;

/** MLB's official game dates follow the US baseball day, not the server's UTC day. */
export function catalogWindow(now: Date) {
  const end = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const dates = Array.from({ length: catalogDays }, (_, offset) => {
    const date = new Date(`${end}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - offset);
    return date.toISOString().slice(0, 10);
  });
  return { start: dates.at(-1)!, end, dates };
}

const teamSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  abbreviation: z.string().min(1),
});
const scheduleSchema = z.object({
  dates: z.array(
    z.object({
      date: gameDateSchema,
      games: z.array(
        z.object({
          gamePk: z.number().int().positive(),
          officialDate: gameDateSchema,
          gameDate: z.iso.datetime({ offset: true }),
          gameNumber: z.number().int().positive().optional(),
          doubleHeader: z.string().optional(),
          status: z.object({
            abstractGameState: z.string(),
            detailedState: z.string(),
          }),
          teams: z.object({
            away: z.object({ team: teamSchema }),
            home: z.object({ team: teamSchema }),
          }),
        }),
      ),
    }),
  ),
});

export type CatalogGame = {
  gamePk: string;
  date: string;
  startsAt: string;
  away: z.infer<typeof teamSchema>;
  home: z.infer<typeof teamSchema>;
  gameNumber: number;
  doubleheader: boolean;
  status: "complete" | "live" | "scheduled" | "unavailable";
  statusLabel: string;
};

/** Deliberately excludes scores, winning teams, and all pitch facts. */
export function normalizeSchedule(
  payload: unknown,
  date: string,
): CatalogGame[] {
  return scheduleSchema
    .parse(payload)
    .dates.flatMap((day) => day.games)
    .filter((game) => game.officialDate === date)
    .map((game): CatalogGame => ({
      gamePk: String(game.gamePk),
      date: game.officialDate,
      startsAt: game.gameDate,
      away: game.teams.away.team,
      home: game.teams.home.team,
      gameNumber: game.gameNumber ?? 1,
      doubleheader: Boolean(game.doubleHeader && game.doubleHeader !== "N"),
      status: ["Final", "Game Over", "Completed Early"].includes(
        game.status.detailedState,
      )
        ? "complete"
        : game.status.abstractGameState === "Live"
          ? "live"
          : ["Postponed", "Cancelled", "Suspended"].some((s) =>
                game.status.detailedState.includes(s),
              )
            ? "unavailable"
            : "scheduled",
      statusLabel: game.status.detailedState,
    }))
    .sort(
      (a, b) =>
        a.startsAt.localeCompare(b.startsAt) ||
        Number(a.gamePk) - Number(b.gamePk),
    );
}

export type GameAvailability =
  | { status: "available" }
  | { status: "queued" | "preparing"; completed: number; total: number | null }
  | { status: "ready"; edition: EditionSummary }
  | {
      status: "failed";
      message: string;
      retryAt: string | null;
      retryable: boolean;
    };

export type GameCatalog = {
  window: ReturnType<typeof catalogWindow>;
  date: string;
  games: Array<CatalogGame & { replay: GameAvailability }>;
};
