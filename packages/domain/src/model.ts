import { z } from "zod";
import type { PitchEvent, PredictionRequest } from "./types";
import { estimateStrikeZoneForPitch } from "./state";

import {
  basesSchema,
  countSchema,
  distribution,
  handSchema,
  pitchEventSchema,
  pitchLocationSchema,
  pitchTypeSchema,
  resultSchema,
  zoneSchema,
} from "./validation";

export const predictionRequestSchema = z.object({
  pitcherId: z.string().min(1),
  batterId: z.string().min(1),
  pitcherHand: handSchema,
  batterSide: handSchema,
  gameDate: z.iso.date(),
  count: countSchema,
  outs: z.number().int().min(0).max(2),
  bases: basesSchema,
  score: z.object({
    away: z.number().int().nonnegative(),
    home: z.number().int().nonnegative(),
  }),
  inning: z.number().int().positive(),
  half: z.enum(["top", "bottom"]),
  pitchNumber: z.number().int().positive(),
  timesThroughOrder: z.number().int().positive(),
  strikeZone: zoneSchema,
  pitcherSessionHistory: z.array(pitchEventSchema),
  currentPaHistory: z.array(pitchEventSchema),
});

export const predictionResponseSchema = z
  .object({
    id: z.string().min(1),
    modelVersion: z.string().min(1),
    pitchMix: distribution(pitchTypeSchema),
    pitchMixSource: z.enum(["model", "samples"]),
    resultMix: distribution(),
    location: z.object({
      density: distribution(),
      expected: pitchLocationSchema,
    }),
    countImpact: distribution(),
    sampleSize: z.number().int().positive(),
    velocity: z
      .array(
        z.object({
          pitchType: pitchTypeSchema,
          mean: z.number().finite(),
          sampleCount: z.number().int().positive(),
        }),
      )
      .max(8),
    possiblePitches: z
      .array(
        z.object({
          pitchType: pitchTypeSchema,
          velocity: z.number().finite().nullable(),
          location: pitchLocationSchema,
          result: resultSchema,
          description: z.string(),
        }),
      )
      .min(1)
      .max(4),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.velocity.map((item) => item.pitchType)).size !==
        value.velocity.length ||
      value.velocity.reduce((sum, item) => sum + item.sampleCount, 0) >
        value.sampleSize
    )
      ctx.addIssue({
        code: "custom",
        message: "Velocity sample counts do not match the forecast.",
      });
  });

export function buildPredictionRequest(input: {
  currentPitch: PitchEvent;
  history: PitchEvent[];
  gameDate: string;
}): PredictionRequest {
  const currentPaHistory = input.history.filter(
    (pitch) => pitch.paId === input.currentPitch.paId,
  );
  const pitcherSessionHistory = input.history.filter(
    (pitch) => pitch.matchup.pitcherId === input.currentPitch.matchup.pitcherId,
  );
  const outs = input.currentPitch.preState.outs;
  if (outs === 3) {
    throw new Error(
      "Cannot build a prediction from a terminal half-inning state.",
    );
  }
  const liveOuts: PredictionRequest["outs"] = outs;
  const strikeZone = estimateStrikeZoneForPitch(
    input.currentPitch,
    input.history,
  );

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
      home: input.currentPitch.preState.homeScore,
    },
    inning: input.currentPitch.preState.inning,
    half: input.currentPitch.preState.half,
    pitchNumber: input.currentPitch.pitchNumber,
    timesThroughOrder:
      new Set(
        pitcherSessionHistory
          .filter(
            (pitch) =>
              pitch.matchup.batterId === input.currentPitch.matchup.batterId &&
              pitch.paId !== input.currentPitch.paId,
          )
          .map((pitch) => pitch.paId),
      ).size + 1,
    strikeZone: { top: strikeZone.top, bottom: strikeZone.bottom },
    pitcherSessionHistory,
    currentPaHistory,
  };
}
