import {
  normalizeMlbLiveFeed,
  type GameReplay,
  normalizeSchedule,
  baseballDate,
  supportedGames,
} from "@pitch/domain";
const base = "https://statsapi.mlb.com";
export async function getRecentDodgersGames(now = new Date()) {
  const end = baseballDate(now);
  const year = Number(end.slice(0, 4));
  const loadSeason = async (season: number) => {
    const response = await fetch(
      `${base}/api/v1/schedule?sportId=1&teamId=119&season=${season}&startDate=${season}-01-01&endDate=${season === year ? end : `${season}-12-31`}&hydrate=team`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok)
      throw new Error(`MLB schedule unavailable (${response.status}).`);
    const payload = (await response.json()) as {
      dates: Array<{ date: string }>;
    };
    return supportedGames(
      payload.dates.flatMap((day) =>
        normalizeSchedule({ dates: [day] }, day.date),
      ),
    );
  };
  const current = await loadSeason(year);
  return current.length >= 10
    ? current
    : supportedGames([...current, ...(await loadSeason(year - 1))]);
}

export async function getSupportedGameReplay(gamePk: string) {
  const games = await getRecentDodgersGames();
  if (!games.some((game) => game.gamePk === gamePk))
    throw new Error(
      "Choose one of the Dodgers’ ten most recent completed games.",
    );
  return getGameReplay(gamePk);
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
