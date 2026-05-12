import { normalizeMlbLiveFeed, type GameReplay, type GameSummary } from "@pitch/domain";
import { getStorage } from "@pitch/db";

const metsTeamId = 121;
const mlbBase = "https://statsapi.mlb.com";

export async function getLatestMetsGame(): Promise<GameSummary> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 21);
  const url = `${mlbBase}/api/v1/schedule?sportId=1&teamId=${metsTeamId}&startDate=${dateOnly(start)}&endDate=${dateOnly(end)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`MLB schedule request failed with ${response.status}.`);
  const payload = await response.json() as {
    dates?: Array<{ games?: Array<Record<string, unknown>> }>;
  };
  const games = payload.dates?.flatMap((date) => date.games ?? []) ?? [];
  const selected = [...games].reverse().find((game) => {
    const status = statusText(game);
    return ["Final", "Game Over", "In Progress", "Live"].some((state) => status.includes(state));
  }) ?? games.at(-1);
  if (!selected) throw new Error("No Mets games were available in the schedule window.");
  return gameSummary(selected);
}

export async function getGameReplay(gamePk: string): Promise<GameReplay> {
  const storage = getStorage();
  const cached = await storage.getReplay(gamePk);
  try {
    const response = await fetch(`${mlbBase}/api/v1.1/game/${gamePk}/feed/live`, { cache: "no-store" });
    if (!response.ok) throw new Error(`MLB live feed request failed with ${response.status}.`);
    const payload = await response.json();
    const replay = normalizeMlbLiveFeed(payload as Record<string, unknown>);
    await storage.saveReplay(replay, payload);
    return replay;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

function gameSummary(game: Record<string, unknown>): GameSummary {
  const teams = objectAt(game, "teams");
  const away = objectAt(objectAt(teams, "away"), "team");
  const home = objectAt(objectAt(teams, "home"), "team");
  return {
    gamePk: String(valueAt(game, "gamePk")),
    label: `${teamLabel(away, "Away")} @ ${teamLabel(home, "Home")}`,
    officialDate: stringAt(game, "officialDate", dateOnly(new Date())),
    awayTeam: stringAt(away, "name", "Away"),
    homeTeam: stringAt(home, "name", "Home"),
    awayScore: numberAt(objectAt(teams, "away"), "score", 0),
    homeScore: numberAt(objectAt(teams, "home"), "score", 0),
    status: statusText(game)
  };
}

function statusText(game: Record<string, unknown>): string {
  return stringAt(objectAt(game, "status"), "detailedState", "Unknown");
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function objectAt(value: unknown, key: string): Record<string, unknown> {
  const nested = valueAt(value, key);
  return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : {};
}

function valueAt(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function stringAt(value: unknown, key: string, fallback: string): string {
  const item = valueAt(value, key);
  return typeof item === "string" ? item : fallback;
}

function teamLabel(team: Record<string, unknown>, fallback: string): string {
  return stringAt(team, "abbreviation", stringAt(team, "teamCode", stringAt(team, "clubName", stringAt(team, "name", fallback))));
}

function numberAt(value: unknown, key: string, fallback: number): number {
  const item = valueAt(value, key);
  return typeof item === "number" && Number.isFinite(item) ? item : fallback;
}
