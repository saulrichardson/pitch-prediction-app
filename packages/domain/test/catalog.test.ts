import { describe, expect, it } from "vitest";
import { catalogWindow, normalizeSchedule } from "../src/catalog";

describe("game discovery", () => {
  it("keeps seven official baseball dates across UTC midnight, month/year and DST boundaries", () => {
    expect(catalogWindow(new Date("2026-01-01T02:00:00Z"))).toEqual({
      end: "2025-12-31",
      start: "2025-12-25",
      dates: [
        "2025-12-31",
        "2025-12-30",
        "2025-12-29",
        "2025-12-28",
        "2025-12-27",
        "2025-12-26",
        "2025-12-25",
      ],
    });
    expect(catalogWindow(new Date("2026-03-09T03:30:00Z")).end).toBe(
      "2026-03-08",
    );
    expect(catalogWindow(new Date("2026-03-09T04:30:00Z")).end).toBe(
      "2026-03-09",
    );
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
});
