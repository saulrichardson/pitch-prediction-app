import {
  buildPredictionRequest,
  legacyReplayContract,
  type ReplayEdition,
  type PitchEvent,
  type GameState,
  type PredictionResponse,
} from "@pitch/domain";
const initial: GameState = {
  inning: 1,
  half: "top",
  count: { balls: 0, strikes: 0 },
  outs: 0,
  bases: { first: false, second: false, third: false },
  awayScore: 0,
  homeScore: 0,
};
const counts = [
  { balls: 0, strikes: 0 },
  { balls: 1, strikes: 0 },
  { balls: 1, strikes: 1 },
  { balls: 1, strikes: 2 },
] as const;
const results = ["ball", "called_strike", "foul", "whiff"] as const;
const kinds = ["CH", "SI", "FF", "SL"] as const;
const pitches: PitchEvent[] = counts.map((count, index) => ({
  id: `fixture-${index}`,
  paId: "fixture-pa",
  pitchNumber: index + 1,
  gamePitchIndex: index,
  source: "actual",
  pitchType: kinds[index],
  result: results[index],
  location: {
    px: index * 0.2 - 0.4,
    pz: 2.1 + index * 0.3,
    zone: 5,
    label: "Middle",
  },
  shape: { velocity: 92 + index, spin: null, release: {}, movement: {} },
  preState: { ...initial, count },
  postState: {
    ...initial,
    count: counts[index + 1] ?? count,
    outs: index === 3 ? 1 : 0,
  },
  matchup: {
    pitcherId: "676083",
    pitcherName: "Janson Junk",
    pitcherHand: "R",
    batterId: "596019",
    batterName: "Francisco Lindor",
    batterSide: "L",
  },
  description:
    index === 3
      ? "Francisco Lindor strikes out swinging."
      : results[index].replace("_", " "),
}));
export function fixturePrediction(index = 0): PredictionResponse {
  return {
    id: `test-only-prediction-${index}`,
    modelVersion: "test-fixture-v1",
    sampleSize: 8,
    pitchMixSource: "model",
    pitchMix: [
      { label: "SI", probability: 0.65 },
      { label: "FF", probability: 0.25 },
      { label: "SL", probability: 0.095 },
      { label: "CH", probability: 0.005 },
    ],
    resultMix: [
      { label: "Strike/Foul", probability: 0.75 },
      { label: "Ball", probability: 0.25 },
    ],
    location: {
      expected: { px: 0.1, pz: 2.5, zone: 5, label: "Middle" },
      density: [{ label: "Middle", probability: 1 }],
    },
    countImpact: [{ label: index === 3 ? "1-2" : "0-1", probability: 1 }],
    velocity: [{ pitchType: "SI", mean: 94.5, sampleCount: 6 }],
    possiblePitches: [
      {
        pitchType: "SI",
        velocity: 94.5,
        location: { px: 0.1, pz: 2.5, zone: 5, label: "Middle" },
        result: "called_strike",
        description: "test sample",
      },
    ],
    createdAt: "2026-09-09T23:00:00Z",
  };
}
export function fixtureEdition(): ReplayEdition {
  return {
    id: "a".repeat(64),
    contract: legacyReplayContract,
    game: {
      gamePk: "fixture",
      label: "NYM @ MIA",
      officialDate: "2026-09-09",
      awayTeam: "Mets",
      homeTeam: "Marlins",
      awayScore: 3,
      homeScore: 2,
      status: "Final",
    },
    publishedAt: "2026-09-10T00:00:00Z",
    modelArtifact: "TEST FIXTURE — NOT A REAL MODEL PREDICTION",
    sourceUrl: "test:fixture",
    pitches: pitches.map((actual, index) => ({
      actual,
      request: buildPredictionRequest({
        currentPitch: actual,
        history: pitches.slice(0, index),
        gameDate: "2026-09-09",
      }),
      prediction: fixturePrediction(index),
    })),
  };
}

/** Nine innings, both halves, distinct matchups and a relief pitcher. */
export function fixtureGameEdition(innings = 9): ReplayEdition {
  const edition = fixtureEdition();
  const actuals = Array.from({ length: innings * 2 }, (_, halfIndex) =>
    pitches.map((source, index) => {
      const pitch = structuredClone(source);
      const gameIndex = halfIndex * pitches.length + index;
      pitch.id = `game-fixture-${gameIndex}`;
      pitch.paId = `game-fixture-pa-${halfIndex}`;
      pitch.gamePitchIndex = gameIndex;
      const frame = {
        inning: Math.floor(halfIndex / 2) + 1,
        half: halfIndex % 2 ? ("bottom" as const) : ("top" as const),
      };
      pitch.preState = {
        ...pitch.preState,
        ...frame,
        outs: 2,
        awayScore: halfIndex > 2 ? 3 : 0,
        homeScore: halfIndex > 6 ? 2 : 0,
      };
      pitch.postState = {
        ...pitch.postState,
        ...frame,
        outs: index === pitches.length - 1 ? 3 : 2,
        awayScore: pitch.preState.awayScore,
        homeScore: pitch.preState.homeScore,
      };
      pitch.matchup = {
        ...pitch.matchup,
        batterId: `${1000 + halfIndex}`,
        batterName: `Batter ${halfIndex + 1}`,
        pitcherId: `${2000 + (halfIndex % 2) + (halfIndex >= 12 ? 2 : 0)}`,
        pitcherName: `${halfIndex >= 12 ? "Relief" : "Starting"} pitcher ${(halfIndex % 2) + 1}`,
      };
      return pitch;
    }),
  ).flat();
  return {
    ...edition,
    id: "d".repeat(64),
    contract: "prepared-game-v2",
    totalPitches: actuals.length,
    pitches: actuals.map((actual, index) => ({
      actual,
      request: buildPredictionRequest({
        currentPitch: actual,
        history: actuals.slice(0, index),
        gameDate: edition.game.officialDate,
      }),
      prediction: fixturePrediction(index),
    })),
  };
}
