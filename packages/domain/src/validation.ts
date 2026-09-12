import { z } from "zod";

export const pitchTypeSchema = z.enum([
  "FF",
  "SI",
  "SL",
  "CH",
  "CU",
  "FC",
  "FS",
  "Other",
]);
export const resultSchema = z.enum([
  "ball",
  "called_strike",
  "whiff",
  "foul",
  "foul_tip",
  "foul_bunt",
  "ball_in_play",
  "hit_by_pitch",
]);
export const handSchema = z.enum(["L", "R", "S", "Unknown"]);
export const countSchema = z.object({
  balls: z.number().int().min(0).max(3),
  strikes: z.number().int().min(0).max(2),
});
export const basesSchema = z.object({
  first: z.boolean(),
  second: z.boolean(),
  third: z.boolean(),
});
export const zoneSchema = z
  .object({ top: z.number().finite(), bottom: z.number().finite() })
  .refine((zone) => zone.top > zone.bottom, "Zone top must exceed bottom.");
export const pitchLocationSchema = z.object({
  px: z.number().finite().nullable(),
  pz: z.number().finite().nullable(),
  zone: z.number().int().nullable(),
  label: z.enum([
    "High left",
    "High middle",
    "High right",
    "Middle left",
    "Middle",
    "Middle right",
    "Low left",
    "Low middle",
    "Low right",
    "Below zone",
    "Low wide",
    "Untracked",
  ]),
  strikeZone: z
    .object({
      top: z.number().finite(),
      bottom: z.number().finite(),
      width: z.number().positive().nullable(),
      depth: z.number().positive().nullable(),
      source: z.enum(["measured", "estimated", "default"]),
    })
    .refine((zone) => zone.top > zone.bottom, "Invalid strike zone.")
    .nullable()
    .optional(),
});
export const stateSchema = z.object({
  inning: z.number().int().positive(),
  half: z.enum(["top", "bottom"]),
  count: countSchema,
  outs: z.number().int().min(0).max(3),
  bases: basesSchema,
  awayScore: z.number().int().nonnegative(),
  homeScore: z.number().int().nonnegative(),
});
export const pitchEventSchema = z.object({
  id: z.string().min(1),
  paId: z.string().min(1),
  pitchNumber: z.number().int().positive(),
  gamePitchIndex: z.number().int().nonnegative(),
  source: z.literal("actual"),
  pitchType: pitchTypeSchema,
  result: resultSchema,
  location: pitchLocationSchema,
  shape: z.object({
    velocity: z.number().finite().nullable(),
    spin: z.number().finite().nullable(),
    release: z.record(z.string(), z.number().finite().nullable()),
    movement: z.record(z.string(), z.number().finite().nullable()),
  }),
  preState: stateSchema,
  postState: stateSchema,
  matchup: z.object({
    pitcherId: z.string().min(1),
    pitcherName: z.string().min(1),
    pitcherHand: handSchema,
    batterId: z.string().min(1),
    batterName: z.string().min(1),
    batterSide: handSchema,
  }),
  description: z.string(),
});

export function distribution(label: z.ZodType<string> = z.string().min(1)) {
  return z
    .array(z.object({ label, probability: z.number().min(0).max(1) }))
    .min(1)
    .max(32)
    .superRefine((items, ctx) => {
      if (new Set(items.map((item) => item.label)).size !== items.length)
        ctx.addIssue({
          code: "custom",
          message: "Distribution labels must be unique.",
        });
      if (
        Math.abs(items.reduce((sum, item) => sum + item.probability, 0) - 1) >
        0.01
      )
        ctx.addIssue({
          code: "custom",
          message: "Distribution probabilities must sum to one.",
        });
    });
}
