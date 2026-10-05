import { describe, expect, it } from "vitest";
import {
  baseballDate,
  supportedGames,
  normalizeSchedule,
} from "../src/catalog";

describe("game discovery", () => {
  it("uses the official baseball day across UTC midnight and DST", () => {
    expect(baseballDate(new Date("2026-01-01T02:00:00Z"))).toBe("2025-12-31");
    expect(baseballDate(new Date("2026-03-09T03:30:00Z"))).toBe("2026-03-08");
    expect(baseballDate(new Date("2026-03-09T04:30:00Z"))).toBe("2026-03-09");
  });
  it("distinguishes doubleheaders and live/cancelled games without exposing scores", () => {
    const base = {
      gamePk: 42,
      officialDate: "2026-09-12",
      gameDate: "2026-09-12T18:00:00Z",
      doubleHeader: "Y",
      gameNumber: 1,
      status: { abstractGameState: "Final", detailedState: "Final" },
      teams: {
        away: {
          team: { id: 1, abbreviation: "SEA", name: "Seattle Mariners" },
          score: 8,
          isWinner: true,
        },
        home: {
          team: { id: 2, abbreviation: "LAD", name: "Los Angeles Dodgers" },
          score: 4,
        },
      },
    };
    const result = normalizeSchedule(
      {
        dates: [
          {
            date: "2026-09-12",
            games: [
              base,
              {
                ...base,
                gamePk: 43,
                gameNumber: 2,
                status: {
                  abstractGameState: "Live",
                  detailedState: "In Progress",
                },
              },
              {
                ...base,
                gamePk: 44,
                status: {
                  abstractGameState: "Preview",
                  detailedState: "Postponed",
                },
              },
              { ...base, gamePk: 45, officialDate: "2026-09-11" },
            ],
          },
        ],
      },
      "2026-09-12",
    );
    expect(result.map((g) => [g.gamePk, g.gameNumber, g.status])).toEqual([
      ["42", 1, "complete"],
      ["43", 2, "live"],
      ["44", 1, "unavailable"],
    ]);
    expect(result.every((g) => g.doubleheader)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/score|isWinner/);
    expect(() =>
      normalizeSchedule({ dates: [{ games: [{}] }] }, "2026-09-12"),
    ).toThrow();
  });
  it("limits the catalog to the ten latest completed Dodgers games", () => {
    const games = Array.from({ length: 14 }, (_, i) => ({
      gamePk: String(100 + i),
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      startsAt: `2026-09-${String(i + 1).padStart(2, "0")}T23:00:00Z`,
      away: { id: 119, abbreviation: "LAD", name: "Dodgers" },
      home: { id: 137, abbreviation: "SF", name: "Giants" },
      gameNumber: 1,
      doubleheader: false,
      status: "complete" as const,
      statusLabel: "Final",
    }));
    const result = supportedGames([
      ...games,
      { ...games[13], gamePk: "live", status: "live" },
      {
        ...games[13],
        gamePk: "unrelated",
        away: { id: 121, abbreviation: "NYM", name: "Mets" },
      },
      games[13],
    ]);
    expect(result).toHaveLength(10);
    expect(result.map((game) => game.gamePk)).toEqual(
      games
        .slice(4)
        .reverse()
        .map((game) => game.gamePk),
    );
  });
});
