import { writeFile, mkdir } from "node:fs/promises";
import { fixtureEdition, fixtureGameEdition } from "../tests/fixtures/replay";
import {
  baseballDate,
  replayContract,
  buildPredictionRequest,
  type CatalogGame,
} from "@pitch/domain";
const dates = Array.from({ length: 10 }, (_, i) => {
  const d = new Date(`${baseballDate(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - i);
  return d.toISOString().slice(0, 10);
});
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
  edition.contract = replayContract;
  edition.totalPitches = edition.pitches.length;
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
  "ATL @ LAD",
  "Atlanta Braves",
  "Los Angeles Dodgers",
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
  "LAD @ SF",
  "Los Angeles Dodgers",
  "San Francisco Giants",
);
const fullGame = fixtureGameEdition();
fullGame.game.gamePk = "900006";
function listed(edition: ReturnType<typeof fixtureEdition>): CatalogGame {
  const [away, home] = edition.game.label.split(" @ ");
  const teamIds: Record<string, number> = {
    ATL: 144,
    SF: 137,
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
  ...Array.from({ length: 6 }, (_, i) => ({
    ...listed(second),
    gamePk: String(900010 + i),
    date: dates[i + 2],
    startsAt: `${dates[i + 2]}T23:00:00Z`,
  })),
  {
    ...listed(second),
    gamePk: "900099",
    away: { id: 121, name: "New York Mets", abbreviation: "NYM" },
    home: { id: 147, name: "New York Yankees", abbreviation: "NYY" },
  },
];
await mkdir(".cache", { recursive: true });
await writeFile(
  ".cache/test-edition.json",
  JSON.stringify({
    ...featured,
    testCatalog: {
      editions: [second, yesterday, fullGame],
      schedules: Object.fromEntries(
        dates.map((date, i) => [
          date,
          i === 0 ? today : i === 1 ? [listed(yesterday)] : [],
        ]),
      ),
    },
  }),
);
