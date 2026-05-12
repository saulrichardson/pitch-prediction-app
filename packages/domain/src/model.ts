import { z } from "zod";
import type {
  PitchEvent,
  PredictionRequest
} from "./types";
import { estimateStrikeZoneForPitch } from "./state";

const pitchLocationSchema = z.object({
  px: z.number().nullable(),
  pz: z.number().nullable(),
  zone: z.number().nullable(),
  label: z.string(),
  strikeZone: z.object({
    top: z.number(),
    bottom: z.number(),
    width: z.number().nullable(),
    depth: z.number().nullable(),
    source: z.enum(["measured", "estimated", "default"])
  }).nullable().optional()
});

export const predictionRequestSchema = z.object({
  pitcherId: z.string(),
  batterId: z.string(),
  pitcherHand: z.enum(["L", "R", "S", "Unknown"]),
  batterSide: z.enum(["L", "R", "S", "Unknown"]),
  gameDate: z.string(),
  count: z.object({ balls: z.number().int().min(0).max(3), strikes: z.number().int().min(0).max(2) }),
  outs: z.number().int().min(0).max(2),
  bases: z.object({ first: z.boolean(), second: z.boolean(), third: z.boolean() }),
  score: z.object({ away: z.number(), home: z.number() }),
  inning: z.number().int().positive(),
  half: z.enum(["top", "bottom"]),
  pitchNumber: z.number().int().nonnegative(),
  timesThroughOrder: z.number().int().nonnegative(),
  strikeZone: z.object({ top: z.number(), bottom: z.number() }),
  pitcherSessionHistory: z.array(z.unknown()),
  currentPaHistory: z.array(z.unknown())
});

export const predictionResponseSchema = z.object({
  id: z.string(),
  modelVersion: z.string(),
  pitchMix: z.array(z.object({ label: z.string(), probability: z.number().min(0).max(1) })),
  resultMix: z.array(z.object({ label: z.string(), probability: z.number().min(0).max(1) })),
  location: z.object({
    density: z.array(z.object({ label: z.string(), probability: z.number().min(0).max(1) })),
    expected: pitchLocationSchema
  }),
  countImpact: z.array(z.object({ label: z.string(), probability: z.number().min(0).max(1) })),
  paForecast: z.array(z.object({ label: z.string(), probability: z.number().min(0).max(1) })),
  expectedPitchesRemaining: z.number().min(0),
  possiblePitches: z.array(z.object({
    pitchType: z.enum(["FF", "SI", "SL", "CH", "CU", "FC", "FS", "Other"]),
    velocity: z.number(),
    location: pitchLocationSchema,
    result: z.enum(["ball", "called_strike", "whiff", "foul", "ball_in_play", "hit_by_pitch"]),
    description: z.string()
  })),
  createdAt: z.string()
});

export function buildPredictionRequest(input: {
  currentPitch: PitchEvent;
  history: PitchEvent[];
  gameDate: string;
  pitchNumber: number;
}): PredictionRequest {
  const currentPaHistory = input.history.filter((pitch) => pitch.paId === input.currentPitch.paId);
  const pitcherSessionHistory = input.history.filter(
    (pitch) => pitch.matchup.pitcherId === input.currentPitch.matchup.pitcherId
  );
  const outs = input.currentPitch.preState.outs;
  if (outs === 3) {
    throw new Error("Cannot build a prediction from a terminal half-inning state.");
  }
  const liveOuts: PredictionRequest["outs"] = outs;
  const strikeZone = estimateStrikeZoneForPitch(input.currentPitch, input.history);

  return {
    pitcherId: input.currentPitch.matchup.pitcherId,
    batterId: input.currentPitch.matchup.batterId,
    pitcherHand: input.currentPitch.matchup.pitcherHand,
    batterSide: input.currentPitch.matchup.batterSide,
    gameDate: input.gameDate,
    count: input.currentPitch.preState.count,
    outs: liveOuts,
    bases: input.currentPitch.preState.bases,
    score: {
      away: input.currentPitch.preState.awayScore,
      home: input.currentPitch.preState.homeScore
    },
    inning: input.currentPitch.preState.inning,
    half: input.currentPitch.preState.half,
    pitchNumber: input.pitchNumber,
    timesThroughOrder: Math.floor(input.currentPitch.gamePitchIndex / 18) + 1,
    strikeZone: { top: strikeZone.top, bottom: strikeZone.bottom },
    pitcherSessionHistory,
    currentPaHistory
  };
}
