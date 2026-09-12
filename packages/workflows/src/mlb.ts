import {
  normalizeMlbLiveFeed,
  type GameReplay,
  type GameSummary,
  normalizeSchedule,
} from "@pitch/domain";
const base = "https://statsapi.mlb.com";
export async function getSchedule(date: string) {
  const response = await fetch(
    `${base}/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=team`,
    {
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok)
    throw new Error(`MLB schedule unavailable (${response.status}).`);
  return normalizeSchedule(await response.json(), date);
}
export async function getLatestMetsGame(): Promise<GameSummary> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 21);
  const response = await fetch(
    `${base}/api/v1/schedule?sportId=1&teamId=121&startDate=${start.toISOString().slice(0, 10)}&endDate=${end.toISOString().slice(0, 10)}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok)
    throw new Error(`MLB schedule unavailable (${response.status}).`);
  const payload = (await response.json()) as {
    dates: Array<{
      games: Array<{
        gamePk: number;
        officialDate: string;
        status: { detailedState: string };
        teams: {
          away: { team: { name: string }; score?: number };
          home: { team: { name: string }; score?: number };
        };
      }>;
    }>;
  };
  const games = payload.dates.flatMap((day) => day.games);
  const game = [...games]
    .reverse()
    .find((item) =>
      ["Final", "Game Over", "Completed Early"].includes(
        item.status.detailedState,
      ),
    );
  if (!game)
    throw new Error("No completed Mets game is available in the last 21 days.");
  return {
    gamePk: String(game.gamePk),
    label: `${game.teams.away.team.name} @ ${game.teams.home.team.name}`,
    officialDate: game.officialDate,
    awayTeam: game.teams.away.team.name,
    homeTeam: game.teams.home.team.name,
    awayScore: game.teams.away.score ?? 0,
    homeScore: game.teams.home.score ?? 0,
    status: game.status.detailedState,
  };
}
export async function getGameReplay(gamePk: string): Promise<GameReplay> {
  if (!/^\d+$/.test(gamePk)) throw new Error("MLB game ID must be numeric.");
  const response = await fetch(`${base}/api/v1.1/game/${gamePk}/feed/live`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(`MLB feed unavailable (${response.status}).`);
  return normalizeMlbLiveFeed(await response.json());
}
