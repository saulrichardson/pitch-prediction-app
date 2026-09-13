import { writeFile, mkdir } from "node:fs/promises";
import { fixtureEdition } from "../tests/fixtures/replay";
import {
  catalogWindow,
  buildPredictionRequest,
  type CatalogGame,
} from "@pitch/domain";
const dates = catalogWindow(new Date()).dates;
function makeEdition(
  id: string,
  gamePk: string,
  date: string,
  label: string,
  away: string,
  home: string,
) {
  const edition = fixtureEdition();
  edition.id = id.repeat(64);
  edition.game = {
    ...edition.game,
    gamePk,
    officialDate: date,
    label,
    awayTeam: away,
    homeTeam: home,
  };
  edition.pitches = edition.pitches.map((item, index) => ({
    ...item,
    request: buildPredictionRequest({
      currentPitch: item.actual,
      history: edition.pitches.slice(0, index).map((p) => p.actual),
      gameDate: date,
    }),
  }));
  return edition;
}
const featured = makeEdition(
  "a",
  "900001",
  dates[0],
  "NYM @ MIA",
  "New York Mets",
  "Miami Marlins",
);
const second = makeEdition(
  "b",
  "900002",
  dates[0],
  "SEA @ LAD",
  "Seattle Mariners",
  "Los Angeles Dodgers",
);
const yesterday = makeEdition(
  "c",
  "900005",
  dates[1],
  "BOS @ NYY",
  "Boston Red Sox",
  "New York Yankees",
);
function listed(edition: ReturnType<typeof fixtureEdition>): CatalogGame {
  const [away, home] = edition.game.label.split(" @ ");
  const teamIds: Record<string, number> = {
    NYM: 121,
    MIA: 146,
    SEA: 136,
    LAD: 119,
    BOS: 111,
    NYY: 147,
  };
  return {
    gamePk: edition.game.gamePk,
    date: edition.game.officialDate,
    startsAt: `${edition.game.officialDate}T23:00:00Z`,
    away: {
      id: teamIds[away],
      name: edition.game.awayTeam,
      abbreviation: away,
    },
    home: {
      id: teamIds[home],
      name: edition.game.homeTeam,
      abbreviation: home,
    },
    gameNumber: 1,
    doubleheader: false,
    status: "complete",
    statusLabel: "Final",
  };
}
const today = [
  listed(featured),
  listed(second),
  {
    ...listed(second),
    gamePk: "900003",
    status: "live" as const,
    statusLabel: "In Progress",
  },
  { ...listed(second), gamePk: "900004", doubleheader: true, gameNumber: 2 },
];
await mkdir(".cache", { recursive: true });
await writeFile(
  ".cache/test-edition.json",
  JSON.stringify({
    ...featured,
    testCatalog: {
      editions: [second, yesterday],
      schedules: Object.fromEntries(
        dates.map((date, i) => [
          date,
          i === 0 ? today : i === 1 ? [listed(yesterday)] : [],
        ]),
      ),
    },
  }),
);
