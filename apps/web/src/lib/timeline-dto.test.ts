import { describe, expect, it } from "vitest";
import type { GameState, PitchEvent, PredictionResponse, Timeline } from "@pitch/domain";
import { toClientTimeline, toReplaySummary } from "./timeline-dto";

const state: GameState = {
  inning: 1,
  half: "top",
  count: { balls: 0, strikes: 0 },
  outs: 0,
  bases: { first: false, second: false, third: false },
  awayScore: 0,
  homeScore: 0
};

describe("timeline DTO redaction", () => {
  it("does not send unrevealed actual pitch fields to the browser", () => {
    const hiddenPitch = pitch({
      id: "hidden",
      pitchType: "CU",
      result: "hit_by_pitch",
      description: "Hit By Pitch",
      location: {
        px: 1.2,
        pz: 3.1,
        zone: 12,
        label: "Waste",
        strikeZone: { top: 3.6, bottom: 1.4, width: 17, depth: 8.5, source: "measured" }
      },
      shape: { velocity: 82.4, spin: 2550, release: { x0: 1.2 }, movement: { breakX: 7.1 } }
    });
    const timeline = serverTimeline({ actualPitches: [hiddenPitch], actualRevealed: false });

    const client = toClientTimeline(timeline);

    expect("actualPitches" in client).toBe(false);
    expect(client.currentPitch).toEqual({
      id: "hidden",
      paId: "pa-1",
      pitchNumber: 1,
      gamePitchIndex: 0,
      source: "actual",
      preState: state,
      matchup: hiddenPitch.matchup
    });
    expect(client.nextPitchContext).toBeNull();
    expect(JSON.stringify(client.currentPitch)).not.toContain("CU");
    expect(JSON.stringify(client.currentPitch)).not.toContain("hit_by_pitch");
    expect(JSON.stringify(client.currentPitch)).not.toContain("Waste");
    expect(JSON.stringify(client.currentPitch)).not.toContain("82.4");
    expect(JSON.stringify(client.currentPitch)).not.toContain("strikeZone");
  });

  it("sends revealed history but only exposes the next context after reveal", () => {
    const first = pitch({ id: "first", pitchType: "FF", result: "ball" });
    const second = pitch({
      id: "second",
      paId: "pa-2",
      pitchNumber: 1,
      gamePitchIndex: 1,
      pitchType: "SL",
      result: "called_strike",
      preState: { ...state, count: { balls: 1, strikes: 0 } }
    });
    const client = toClientTimeline(serverTimeline({
      actualPitches: [first, second],
      actualHistory: [first],
      actualRevealed: true,
      currentPitchIndex: 0
    }));

    expect(client.actualHistory[0]?.pitchType).toBe("FF");
    expect(client.nextPitchContext).toMatchObject({
      id: "second",
      paId: "pa-2",
      gamePitchIndex: 1,
      preState: { count: { balls: 1, strikes: 0 } }
    });
    expect(JSON.stringify(client.nextPitchContext)).not.toContain("SL");
    expect(JSON.stringify(client.nextPitchContext)).not.toContain("called_strike");
  });

  it("summarizes replay ingestion without returning pitch events", () => {
    const first = pitch({ id: "first" });
    const summary = toReplaySummary({
      game: game(),
      pitches: [first, pitch({ id: "second" })]
    });

    expect(summary).toEqual({ game: game(), pitchCount: 2 });
    expect(JSON.stringify(summary)).not.toContain(first.pitchType);
    expect("pitches" in summary).toBe(false);
  });
});

function serverTimeline(overrides: Partial<Timeline>): Timeline {
  return {
    id: "timeline-1",
    workspaceId: "workspace-1",
    mode: "real-game",
    game: game(),
    actualPitches: [],
    currentPitchIndex: 0,
    actualHistory: [],
    actualForecastHistory: [],
    actualPrediction: prediction(),
    actualRevealed: false,
    activeBranchId: null,
    branches: [],
    manualSituation: null,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    ...overrides
  };
}

function pitch(overrides: Partial<PitchEvent>): PitchEvent {
  return {
    id: "pitch-1",
    paId: "pa-1",
    pitchNumber: 1,
    gamePitchIndex: 0,
    source: "actual",
    pitchType: "FF",
    result: "called_strike",
    location: { px: 0, pz: 2.5, zone: 5, label: "Middle" },
    shape: { velocity: 94, spin: null, release: {}, movement: {} },
    preState: state,
    postState: { ...state, count: { balls: 0, strikes: 1 } },
    matchup: {
      pitcherId: "10",
      pitcherName: "Pitcher",
      pitcherHand: "R",
      batterId: "20",
      batterName: "Batter",
      batterSide: "L"
    },
    description: "Called Strike",
    ...overrides
  };
}

function prediction(): PredictionResponse {
  return {
    id: "prediction-1",
    modelVersion: "pitchpredict-xlstm-v0.5.0",
    pitchMix: [{ label: "SI", probability: 1 }],
    resultMix: [{ label: "Strike/Foul", probability: 1 }],
    location: {
      density: [{ label: "Middle", probability: 1 }],
      expected: { px: 0, pz: 2.5, zone: 5, label: "Middle" }
    },
    countImpact: [{ label: "0-1", probability: 1 }],
    paForecast: [{ label: "Still alive after 8 pitches", probability: 1 }],
    expectedPitchesRemaining: 3.2,
    possiblePitches: [],
    createdAt: "2026-05-10T00:00:00.000Z"
  };
}

function game() {
  return {
    gamePk: "123",
    label: "NYM @ AZ",
    officialDate: "2026-05-10",
    awayTeam: "New York Mets",
    homeTeam: "Arizona Diamondbacks",
    awayScore: 0,
    homeScore: 0,
    status: "Final"
  };
}
