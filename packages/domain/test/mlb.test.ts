import { describe, expect, it } from "vitest";
import { normalizeMlbLiveFeed } from "../src";

describe("MLB live feed normalization", () => {
  it("normalizes pitch-level game feed data into internal pitch events", () => {
    const replay = normalizeMlbLiveFeed({
      gamePk: 123,
      gameData: {
        datetime: { officialDate: "2026-05-09" },
        status: { detailedState: "Final" },
        teams: {
          away: { name: "New York Mets", abbreviation: "NYM" },
          home: { name: "Atlanta Braves", abbreviation: "ATL" }
        }
      },
      liveData: {
        linescore: { teams: { away: { runs: 2 }, home: { runs: 1 } } },
        plays: {
          allPlays: [
            {
              about: { atBatIndex: 0, inning: 1, halfInning: "top" },
              count: { outs: 0 },
              matchup: {
                pitcher: { id: 10, fullName: "Pitcher One" },
                batter: { id: 20, fullName: "Batter One" },
                pitchHand: { code: "R" },
                batSide: { code: "L" }
              },
              result: { awayScore: 0, homeScore: 0 },
              playEvents: [
                {
                  isPitch: true,
                  count: { balls: 0, strikes: 1, outs: 0 },
                  details: {
                    code: "C",
                    description: "Called Strike",
                    isStrike: true,
                    type: { code: "FF" }
                  },
                  pitchData: {
                    startSpeed: 96.2,
                    zone: 5,
                    strikeZoneTop: 3.42,
                    strikeZoneBottom: 1.51,
                    strikeZoneWidth: 17,
                    strikeZoneDepth: 8.5,
                    coordinates: { pX: 0.1, pZ: 2.6 },
                    breaks: { breakHorizontal: 7.5, breakVertical: -12.1 }
                  }
                }
              ]
            },
            {
              about: { atBatIndex: 1, inning: 1, halfInning: "top" },
              count: { balls: 4, strikes: 0, outs: 0 },
              matchup: {
                pitcher: { id: 10, fullName: "Pitcher One" },
                batter: { id: 21, fullName: "Batter Two" },
                pitchHand: { code: "R" },
                batSide: { code: "R" }
              },
              result: { event: "Walk", awayScore: 0, homeScore: 0 },
              runners: [
                { movement: { start: null, end: "1B", isOut: false } }
              ],
              playEvents: [
                {
                  isPitch: true,
                  count: { balls: 1, strikes: 0, outs: 0 },
                  details: {
                    code: "B",
                    description: "Ball",
                    isBall: true,
                    type: { code: "SI" }
                  },
                  pitchData: {
                    startSpeed: 94.1,
                    zone: 11,
                    coordinates: { pX: -0.8, pZ: 1.2 },
                    breaks: {}
                  }
                },
                {
                  isPitch: true,
                  count: { balls: 4, strikes: 0, outs: 0 },
                  details: {
                    code: "B",
                    description: "Ball",
                    isBall: true,
                    type: { code: "SI" }
                  },
                  pitchData: {
                    startSpeed: 94.4,
                    zone: 12,
                    coordinates: { pX: 0.8, pZ: 1.2 },
                    breaks: {}
                  }
                }
              ]
            },
            {
              about: { atBatIndex: 2, inning: 1, halfInning: "top" },
              count: { balls: 0, strikes: 0, outs: 0 },
              matchup: {
                pitcher: { id: 10, fullName: "Pitcher One" },
                batter: { id: 22, fullName: "Batter Three" },
                pitchHand: { code: "R" },
                batSide: { code: "L" }
              },
              result: { event: "Double", awayScore: 1, homeScore: 0 },
              runners: [
                { movement: { start: null, end: "2B", isOut: false } },
                { movement: { start: "1B", end: "3B", isOut: false } },
                { movement: { start: "3B", end: "score", isOut: false } }
              ],
              playEvents: [
                {
                  isPitch: true,
                  count: { balls: 0, strikes: 0, outs: 0 },
                  details: {
                    code: "X",
                    description: "In play, run(s)",
                    isInPlay: true,
                    type: { code: "FF" }
                  },
                  pitchData: {
                    startSpeed: 95.3,
                    zone: 5,
                    coordinates: { pX: 0, pZ: 2.5 },
                    breaks: {}
                  }
                }
              ]
            }
          ]
        }
      }
    });

    expect(replay.game.label).toBe("NYM @ ATL");
    expect(replay.pitches).toHaveLength(4);
    expect(replay.pitches[0]).toMatchObject({
      pitchType: "FF",
      result: "called_strike",
      location: {
        strikeZone: {
          top: 3.42,
          bottom: 1.51,
          width: 17,
          depth: 8.5,
          source: "measured"
        }
      },
      matchup: { pitcherName: "Pitcher One", batterName: "Batter One" },
      preState: { count: { balls: 0, strikes: 0 }, outs: 0, awayScore: 0, homeScore: 0 },
      postState: { count: { balls: 0, strikes: 0 }, outs: 0, awayScore: 0, homeScore: 0 }
    });
    expect(replay.pitches[1]).toMatchObject({
      pitchType: "SI",
      result: "ball",
      preState: { count: { balls: 0, strikes: 0 }, bases: { first: false, second: false, third: false } },
      postState: { count: { balls: 1, strikes: 0 }, bases: { first: false, second: false, third: false } }
    });
    expect(replay.pitches[2]).toMatchObject({
      result: "ball",
      preState: { count: { balls: 1, strikes: 0 } },
      postState: { count: { balls: 0, strikes: 0 }, bases: { first: true, second: false, third: false } }
    });
    expect(replay.pitches[3]).toMatchObject({
      result: "ball_in_play",
      preState: { bases: { first: true, second: false, third: false }, awayScore: 0 },
      postState: { bases: { first: false, second: true, third: true }, awayScore: 1 }
    });
  });

  it("applies runner movements without depending on MLB runner array order", () => {
    const replay = normalizeMlbLiveFeed({
      gamePk: 456,
      gameData: {
        datetime: { officialDate: "2026-05-09" },
        status: { detailedState: "Final" },
        teams: { away: { abbreviation: "NYM" }, home: { abbreviation: "ATL" } }
      },
      liveData: {
        linescore: { teams: { away: { runs: 0 }, home: { runs: 0 } } },
        plays: {
          allPlays: [
            {
              about: { atBatIndex: 0, inning: 1, halfInning: "top" },
              count: { outs: 0 },
              matchup: matchup(),
              result: { awayScore: 0, homeScore: 0 },
              runners: [{ movement: { start: null, end: "1B", isOut: false } }],
              playEvents: [pitchEvent("B", "Ball", "SI", { balls: 4, strikes: 0, outs: 0 })]
            },
            {
              about: { atBatIndex: 1, inning: 1, halfInning: "top" },
              count: { outs: 0 },
              matchup: matchup({ batterId: 21, batterName: "Batter Two" }),
              result: { awayScore: 0, homeScore: 0 },
              runners: [
                { movement: { start: null, end: "1B", isOut: false } },
                { movement: { start: "1B", end: "2B", isOut: false } }
              ],
              playEvents: [pitchEvent("X", "In play, no out", "FF", { balls: 0, strikes: 0, outs: 0 }, true)]
            }
          ]
        }
      }
    });

    expect(replay.pitches[1]?.preState.bases).toEqual({ first: true, second: false, third: false });
    expect(replay.pitches[1]?.postState.bases).toEqual({ first: true, second: true, third: false });
  });

  it("applies non-pitch runner events before the next pitch", () => {
    const replay = normalizeMlbLiveFeed({
      gamePk: 789,
      gameData: {
        datetime: { officialDate: "2026-05-09" },
        status: { detailedState: "Final" },
        teams: { away: { abbreviation: "NYM" }, home: { abbreviation: "ATL" } }
      },
      liveData: {
        linescore: { teams: { away: { runs: 0 }, home: { runs: 0 } } },
        plays: {
          allPlays: [
            {
              about: { atBatIndex: 0, inning: 1, halfInning: "top" },
              count: { outs: 0 },
              matchup: matchup(),
              result: { awayScore: 0, homeScore: 0 },
              runners: [{ movement: { start: null, end: "1B", isOut: false } }],
              playEvents: [pitchEvent("B", "Ball", "SI", { balls: 4, strikes: 0, outs: 0 })]
            },
            {
              about: { atBatIndex: 1, inning: 1, halfInning: "top" },
              count: { outs: 0 },
              matchup: matchup({ batterId: 21, batterName: "Batter Two" }),
              result: { awayScore: 0, homeScore: 0 },
              playEvents: [
                {
                  isPitch: false,
                  count: { balls: 0, strikes: 0, outs: 0 },
                  runners: [{ movement: { start: "1B", end: "2B", isOut: false } }]
                },
                pitchEvent("C", "Called Strike", "FF", { balls: 0, strikes: 1, outs: 0 })
              ]
            }
          ]
        }
      }
    });

    expect(replay.pitches[1]?.preState.bases).toEqual({ first: false, second: true, third: false });
  });

  it("preserves the third out in final pitch post-state", () => {
    const replay = normalizeMlbLiveFeed({
      gamePk: 999,
      gameData: {
        datetime: { officialDate: "2026-05-09" },
        status: { detailedState: "Final" },
        teams: { away: { abbreviation: "NYM" }, home: { abbreviation: "ATL" } }
      },
      liveData: {
        linescore: { teams: { away: { runs: 0 }, home: { runs: 0 } } },
        plays: {
          allPlays: [
            {
              about: { atBatIndex: 0, inning: 1, halfInning: "top" },
              count: { outs: 2 },
              matchup: matchup(),
              result: { awayScore: 0, homeScore: 0 },
              playEvents: []
            },
            {
              about: { atBatIndex: 1, inning: 1, halfInning: "top" },
              count: { outs: 3 },
              matchup: matchup({ batterId: 21, batterName: "Batter Two" }),
              result: { awayScore: 0, homeScore: 0 },
              playEvents: [pitchEvent("S", "Swinging Strike", "SL", { balls: 0, strikes: 3, outs: 3 })]
            }
          ]
        }
      }
    });

    expect(replay.pitches[0]?.preState.outs).toBe(2);
    expect(replay.pitches[0]?.postState.outs).toBe(3);
  });
});

function matchup(overrides: Record<string, unknown> = {}) {
  return {
    pitcher: { id: 10, fullName: "Pitcher One" },
    batter: { id: overrides.batterId ?? 20, fullName: overrides.batterName ?? "Batter One" },
    pitchHand: { code: "R" },
    batSide: { code: "L" }
  };
}

function pitchEvent(code: string, description: string, pitchType: string, count: Record<string, number>, isInPlay = false) {
  return {
    isPitch: true,
    count,
    details: {
      code,
      description,
      isBall: code === "B",
      isStrike: code === "C" || code === "S",
      isInPlay,
      type: { code: pitchType }
    },
    pitchData: {
      startSpeed: 95,
      zone: 5,
      coordinates: { pX: 0, pZ: 2.5 },
      breaks: {}
    }
  };
}
