import { describe, expect, it } from "vitest";
import {
  advanceActualTimeline,
  applyPitchResult,
  buildPredictionRequest,
  createActualTimeline,
  evaluatePitch,
  locationFromBucket,
  revealCurrentPitch,
  stepBackActualTimeline,
  type GameState,
  type PitchEvent,
  type PredictionResponse,
  type PredictFn
} from "../src";

const state: GameState = {
  inning: 1,
  half: "top",
  count: { balls: 0, strikes: 0 },
  outs: 0,
  bases: { first: false, second: false, third: false },
  awayScore: 0,
  homeScore: 0
};

describe("baseball state transitions", () => {
  it("adds a ball and walks on ball four", () => {
    expect(applyPitchResult(state, "ball").postState.count).toEqual({ balls: 1, strikes: 0 });
    const walk = applyPitchResult({ ...state, count: { balls: 3, strikes: 1 } }, "ball");
    expect(walk.terminalState).toBe("walk");
    expect(walk.postState.bases.first).toBe(true);
  });

  it("keeps a two-strike foul alive", () => {
    const result = applyPitchResult({ ...state, count: { balls: 1, strikes: 2 } }, "foul");
    expect(result.terminalState).toBeNull();
    expect(result.postState.count).toEqual({ balls: 1, strikes: 2 });
  });

  it("ends a plate appearance on strike three, hit by pitch, or ball in play", () => {
    expect(applyPitchResult({ ...state, count: { balls: 1, strikes: 2 } }, "whiff").terminalState).toBe("strikeout");
    expect(applyPitchResult(state, "hit_by_pitch").terminalState).toBe("hit_by_pitch");
    expect(applyPitchResult(state, "ball_in_play").terminalState).toBe("ball_in_play");
  });

  it("represents a third out in post-pitch state", () => {
    const result = applyPitchResult({ ...state, count: { balls: 1, strikes: 2 }, outs: 2 }, "whiff");
    expect(result.terminalState).toBe("strikeout");
    expect(result.postState.outs).toBe(3);
  });
});

describe("prediction evaluation", () => {
  it("labels expected and surprising actual pitches by probability and rank", () => {
    const prediction = testPrediction();
    const actual: PitchEvent = {
      id: "actual",
      paId: "pa",
      pitchNumber: 1,
      gamePitchIndex: 0,
      source: "actual",
      pitchType: prediction.pitchMix[0].label as PitchEvent["pitchType"],
      result: "called_strike",
      location: locationFromBucket("Middle"),
      shape: { velocity: 95, spin: null, release: {}, movement: {} },
      preState: state,
      postState: state,
      matchup: {
        pitcherId: "1",
        pitcherName: "Pitcher",
        pitcherHand: "R",
        batterId: "2",
        batterName: "Batter",
        batterSide: "R"
      },
      description: "Called strike"
    };
    expect(evaluatePitch(prediction, actual).label).toBe("Expected");
  });

  it("ranks actual pitch type from the sorted forecast and uses matching velocity read", () => {
    const prediction = testPrediction({
      pitchMix: [
        { label: "SL", probability: 0.2 },
        { label: "FF", probability: 0.4 },
        { label: "FF", probability: 0.1 },
        { label: "CH", probability: 0.3 }
      ],
      possiblePitches: [
        {
          pitchType: "SL",
          velocity: 86,
          location: locationFromBucket("Low Away"),
          result: "whiff",
          description: "SL 86.0 low away, whiff"
        },
        {
          pitchType: "CH",
          velocity: 88,
          location: locationFromBucket("Low Away"),
          result: "ball",
          description: "CH 88.0 low away, ball"
        }
      ]
    });
    const actual: PitchEvent = {
      id: "actual",
      paId: "pa",
      pitchNumber: 1,
      gamePitchIndex: 0,
      source: "actual",
      pitchType: "CH",
      result: "ball",
      location: locationFromBucket("Low Away"),
      shape: { velocity: 89.2, spin: null, release: {}, movement: {} },
      preState: state,
      postState: state,
      matchup: {
        pitcherId: "1",
        pitcherName: "Pitcher",
        pitcherHand: "R",
        batterId: "2",
        batterName: "Batter",
        batterSide: "R"
      },
      description: "Ball"
    };

    const evaluation = evaluatePitch(prediction, actual);

    expect(evaluation.topPitchType).toBe("FF");
    expect(evaluation.topPitchProbability).toBeCloseTo(0.5);
    expect(evaluation.pitchTypeRank).toBe(2);
    expect(evaluation.pitchTypeProbability).toBeCloseTo(0.3);
    expect(evaluation.velocityErrorMph).toBeCloseTo(1.2);
  });
});

describe("strike zone estimates", () => {
  it("builds prediction requests from prior batter strike-zone measurements, not a fixed frame", () => {
    const currentPitch = testPitch({
      id: "current",
      paId: "pa-current",
      pitchNumber: 1,
      gamePitchIndex: 5,
      matchup: { batterId: "2", batterName: "Batter" }
    });
    const priorPitch = testPitch({
      id: "prior",
      paId: "pa-prior",
      pitchNumber: 2,
      gamePitchIndex: 2,
      location: {
        ...locationFromBucket("Middle"),
        strikeZone: {
          top: 3.62,
          bottom: 1.44,
          width: 17,
          depth: 8.5,
          source: "measured"
        }
      },
      matchup: { batterId: "2", batterName: "Batter" }
    });

    const request = buildPredictionRequest({
      currentPitch,
      history: [priorPitch],
      gameDate: "2026-05-09",
      pitchNumber: 6
    });

    expect(request.strikeZone).toEqual({ top: 3.62, bottom: 1.44 });
  });

  it("uses a standard zone when the current batter has no prior measured zone", () => {
    const request = buildPredictionRequest({
      currentPitch: testPitch({
        location: {
          ...locationFromBucket("Waste"),
          strikeZone: {
            top: 4.1,
            bottom: 1.1,
            width: 17,
            depth: 8.5,
            source: "measured"
          }
        }
      }),
      history: [],
      gameDate: "2026-05-09",
      pitchNumber: 1
    });

    expect(request.strikeZone).toEqual({ top: 3.5, bottom: 1.5 });
  });
});

describe("actual timeline replay", () => {
  it("rejects revealing the same pitch twice", async () => {
    const timeline = await createActualTimeline({
      workspaceId: "workspace",
      replay: {
        game: {
          gamePk: "game",
          label: "Away @ Home",
          officialDate: "2026-05-09",
          awayTeam: "Away",
          homeTeam: "Home",
          awayScore: 0,
          homeScore: 0,
          status: "Final"
        },
        pitches: [testPitch()]
      },
      predict: testPredict
    });

    const revealed = revealCurrentPitch(timeline).timeline;

    expect(() => revealCurrentPitch(revealed)).toThrow("Actual pitch is already revealed.");
  });

  it("records the pre-pitch forecast with actual history when advancing", async () => {
    const pitch: PitchEvent = {
      id: "actual",
      paId: "pa",
      pitchNumber: 1,
      gamePitchIndex: 0,
      source: "actual",
      pitchType: "FF",
      result: "called_strike",
      location: locationFromBucket("Middle"),
      shape: { velocity: 95, spin: null, release: {}, movement: {} },
      preState: state,
      postState: state,
      matchup: {
        pitcherId: "1",
        pitcherName: "Pitcher",
        pitcherHand: "R",
        batterId: "2",
        batterName: "Batter",
        batterSide: "R"
      },
      description: "Called strike"
    };
    const timeline = await createActualTimeline({
      workspaceId: "workspace",
      replay: {
        game: {
          gamePk: "game",
          label: "Away @ Home",
          officialDate: "2026-05-09",
          awayTeam: "Away",
          homeTeam: "Home",
          awayScore: 0,
          homeScore: 0,
          status: "Final"
        },
        pitches: [pitch]
      },
      predict: testPredict
    });

    const revealed = revealCurrentPitch(timeline).timeline;
    const advanced = await advanceActualTimeline(revealed, testPredict);

    expect(advanced.actualHistory).toHaveLength(1);
    expect(advanced.actualForecastHistory).toHaveLength(1);
    expect(advanced.actualForecastHistory[0]?.pitchId).toBe("actual");
    expect(advanced.actualForecastHistory[0]?.prediction.id).toBe(timeline.actualPrediction.id);
    expect(advanced.actualForecastHistory[0]?.evaluation.pitchTypeProbability).toBeGreaterThan(0);
  });

  it("commits the final pitch once and keeps final advance idempotent", async () => {
    const pitch: PitchEvent = {
      id: "final",
      paId: "pa",
      pitchNumber: 1,
      gamePitchIndex: 0,
      source: "actual",
      pitchType: "FF",
      result: "called_strike",
      location: locationFromBucket("Middle"),
      shape: { velocity: 95, spin: null, release: {}, movement: {} },
      preState: state,
      postState: { ...state, count: { balls: 0, strikes: 1 } },
      matchup: {
        pitcherId: "1",
        pitcherName: "Pitcher",
        pitcherHand: "R",
        batterId: "2",
        batterName: "Batter",
        batterSide: "R"
      },
      description: "Called strike"
    };
    const timeline = await createActualTimeline({
      workspaceId: "workspace",
      replay: {
        game: {
          gamePk: "game",
          label: "Away @ Home",
          officialDate: "2026-05-09",
          awayTeam: "Away",
          homeTeam: "Home",
          awayScore: 0,
          homeScore: 0,
          status: "Final"
        },
        pitches: [pitch]
      },
      predict: testPredict
    });

    const revealed = revealCurrentPitch(timeline).timeline;
    const completed = await advanceActualTimeline(revealed, testPredict);
    const advancedAgain = await advanceActualTimeline(completed, testPredict);

    expect(completed.actualHistory.map((item) => item.id)).toEqual(["final"]);
    expect(completed.actualForecastHistory).toHaveLength(1);
    expect(advancedAgain.actualHistory.map((item) => item.id)).toEqual(["final"]);
    expect(advancedAgain.actualForecastHistory).toHaveLength(1);
  });

  it("steps back through reveal and advance states", async () => {
    const afterFirst: GameState = { ...state, count: { balls: 0, strikes: 1 } };
    const firstPitch: PitchEvent = {
      id: "actual-1",
      paId: "pa",
      pitchNumber: 1,
      gamePitchIndex: 0,
      source: "actual",
      pitchType: "FF",
      result: "called_strike",
      location: locationFromBucket("Middle"),
      shape: { velocity: 95, spin: null, release: {}, movement: {} },
      preState: state,
      postState: afterFirst,
      matchup: {
        pitcherId: "1",
        pitcherName: "Pitcher",
        pitcherHand: "R",
        batterId: "2",
        batterName: "Batter",
        batterSide: "R"
      },
      description: "Called strike"
    };
    const secondPitch: PitchEvent = {
      ...firstPitch,
      id: "actual-2",
      pitchNumber: 2,
      gamePitchIndex: 1,
      pitchType: "SL",
      result: "ball",
      location: locationFromBucket("Low Away"),
      shape: { velocity: 86, spin: null, release: {}, movement: {} },
      preState: afterFirst,
      postState: { ...afterFirst, count: { balls: 1, strikes: 1 } },
      description: "Ball"
    };
    const timeline = await createActualTimeline({
      workspaceId: "workspace",
      replay: {
        game: {
          gamePk: "game",
          label: "Away @ Home",
          officialDate: "2026-05-09",
          awayTeam: "Away",
          homeTeam: "Home",
          awayScore: 0,
          homeScore: 0,
          status: "Final"
        },
        pitches: [firstPitch, secondPitch]
      },
      predict: testPredict
    });

    const revealed = revealCurrentPitch(timeline);
    const hiddenAgain = stepBackActualTimeline(revealed.timeline);

    expect(hiddenAgain.timeline.currentPitchIndex).toBe(0);
    expect(hiddenAgain.timeline.actualRevealed).toBe(false);
    expect(hiddenAgain.pitch).toBeUndefined();
    expect(hiddenAgain.evaluation).toBeUndefined();

    const advanced = await advanceActualTimeline(revealed.timeline, testPredict);
    const backToFirstResult = stepBackActualTimeline(advanced);

    expect(backToFirstResult.timeline.currentPitchIndex).toBe(0);
    expect(backToFirstResult.timeline.actualRevealed).toBe(true);
    expect(backToFirstResult.timeline.actualHistory).toHaveLength(0);
    expect(backToFirstResult.timeline.actualForecastHistory).toHaveLength(0);
    expect(backToFirstResult.timeline.actualPrediction.id).toBe(timeline.actualPrediction.id);
    expect(backToFirstResult.pitch?.id).toBe("actual-1");
    expect(backToFirstResult.evaluation?.pitchTypeProbability).toBeGreaterThan(0);
  });

});

function testPitch(overrides: Omit<Partial<PitchEvent>, "matchup"> & { matchup?: Partial<PitchEvent["matchup"]> } = {}): PitchEvent {
  const matchup = {
    pitcherId: "1",
    pitcherName: "Pitcher",
    pitcherHand: "R" as const,
    batterId: "2",
    batterName: "Batter",
    batterSide: "R" as const,
    ...overrides.matchup
  };

  return {
    id: "actual",
    paId: "pa",
    pitchNumber: 1,
    gamePitchIndex: 0,
    source: "actual",
    pitchType: "FF",
    result: "called_strike",
    location: locationFromBucket("Middle"),
    shape: { velocity: 95, spin: null, release: {}, movement: {} },
    preState: state,
    postState: state,
    description: "Called strike",
    ...overrides,
    matchup
  };
}

function testPrediction(overrides: Partial<PredictionResponse> = {}): PredictionResponse {
  return {
    id: "real-model-test-prediction",
    modelVersion: "pitchpredict-test-real-contract",
    pitchMix: [
      { label: "FF", probability: 0.42 },
      { label: "SL", probability: 0.24 },
      { label: "CH", probability: 0.18 }
    ],
    resultMix: [
      { label: "Strike/Foul", probability: 0.52 },
      { label: "Ball", probability: 0.31 },
      { label: "Ball In Play", probability: 0.17 }
    ],
    location: {
      density: [
        { label: "Middle", probability: 0.4 },
        { label: "Low Away", probability: 0.32 }
      ],
      expected: locationFromBucket("Middle")
    },
    countImpact: [
      { label: "0-1", probability: 0.52 },
      { label: "1-0", probability: 0.31 },
      { label: "Ball in play", probability: 0.17 }
    ],
    paForecast: [
      { label: "Ball in play", probability: 0.47 },
      { label: "Strikeout", probability: 0.24 },
      { label: "Walk", probability: 0.12 }
    ],
    expectedPitchesRemaining: 3.1,
    possiblePitches: [
      {
        pitchType: "FF",
        velocity: 95,
        location: locationFromBucket("Middle"),
        result: "called_strike",
        description: "FF 95.0 middle, called strike"
      }
    ],
    createdAt: "2026-05-09T00:00:00.000Z",
    ...overrides
  };
}

const testPredict: PredictFn = async () => testPrediction();
