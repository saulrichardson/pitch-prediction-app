import { z } from "zod";
import {
  buildPredictionRequest,
  predictionRequestSchema,
  predictionResponseSchema,
} from "./model";
import {
  applyPitchResult,
  bucketFromZone,
  evaluatePitch,
  estimateStrikeZoneForPitch,
} from "./state";
import { pitchEventSchema } from "./validation";
import type {
  GameReplay,
  GameSummary,
  PitchEvent,
  PitchMoment,
  PredictionRequest,
  PredictionResponse,
} from "./types";

export const replayContract = "prepared-replay-v1";
export const maxFeaturedPitches = 8;

export type ReplayEdition = {
  id: string;
  contract: typeof replayContract;
  game: GameSummary;
  publishedAt: string;
  modelArtifact: string;
  sourceUrl: string;
  pitches: Array<{
    actual: PitchEvent;
    request: PredictionRequest;
    prediction: PredictionResponse;
  }>;
};

export const commandSchema = z
  .object({
    id: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    action: z.enum(["reveal", "next", "back", "restart"]),
  })
  .strict();
export type ReplayCommand = z.infer<typeof commandSchema>;
export type ReplaySession = {
  id: string;
  workspaceId: string;
  editionId: string;
  step: number;
  revision: number;
  lastCommand: ReplayCommand | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
};

export class ReplayConflict extends Error {
  constructor(
    message = "This replay has changed. Your place has been restored.",
  ) {
    super(message);
  }
}

// Navigation changes only a cursor. Inference and actual game facts are immutable.
export function applyReplayCommand(
  session: ReplaySession,
  command: ReplayCommand,
  pitchCount: number,
  now: string,
): ReplaySession {
  if (session.lastCommand?.id === command.id) {
    if (
      session.lastCommand.action !== command.action ||
      session.lastCommand.expectedRevision !== command.expectedRevision
    )
      throw new ReplayConflict();
    return session;
  }
  if (command.expectedRevision !== session.revision) throw new ReplayConflict();
  const lastStep = pitchCount * 2 - 1;
  const revealed = session.step % 2 === 1;
  let step: number;
  switch (command.action) {
    case "reveal":
      if (revealed || session.step >= lastStep) throw new ReplayConflict();
      step = session.step + 1;
      break;
    case "next":
      if (!revealed || session.step >= lastStep) throw new ReplayConflict();
      step = session.step + 1;
      break;
    case "back":
      if (session.step === 0) throw new ReplayConflict();
      step = session.step - 1;
      break;
    case "restart":
      step = 0;
      break;
  }
  return {
    ...session,
    step,
    revision: session.revision + 1,
    lastCommand: command,
    updatedAt: now,
  };
}

export function editionSummary(edition: ReplayEdition) {
  const first = edition.pitches[0].actual;
  return {
    id: edition.id,
    game: {
      gamePk: edition.game.gamePk,
      label: edition.game.label,
      officialDate: edition.game.officialDate,
    },
    matchup: first.matchup,
    inning: first.preState.inning,
    half: first.preState.half,
    pitchCount: edition.pitches.length,
    publishedAt: edition.publishedAt,
    modelVersion: edition.pitches[0].prediction.modelVersion,
  };
}
export type EditionSummary = ReturnType<typeof editionSummary>;

function moment(pitch: PitchEvent): PitchMoment {
  const { id, paId, pitchNumber, gamePitchIndex, source, preState, matchup } =
    pitch;
  return { id, paId, pitchNumber, gamePitchIndex, source, preState, matchup };
}

function displayPitch(pitch: PitchEvent): PitchEvent {
  return {
    ...pitch,
    location: {
      ...pitch.location,
      label: bucketFromZone(
        pitch.location.zone,
        pitch.location.px,
        pitch.location.pz,
      ),
    },
  };
}

export function replayView(session: ReplaySession, edition: ReplayEdition) {
  if (
    !Number.isInteger(session.step) ||
    session.step < 0 ||
    !Number.isInteger(session.revision) ||
    session.revision < 0
  )
    throw new Error("Invalid replay cursor.");
  const index = Math.floor(session.step / 2);
  const current = edition.pitches[index];
  if (!current || session.editionId !== edition.id)
    throw new Error("Replay cursor does not match its edition.");
  const revealed = session.step % 2 === 1;
  const completed = session.step === edition.pitches.length * 2 - 1;
  const history = edition.pitches
    .slice(0, index + (revealed ? 1 : 0))
    .map((item, pitchIndex) => ({
      index: pitchIndex,
      actual: displayPitch(item.actual),
      evaluation: evaluatePitch(item.prediction, item.actual),
    }));
  return {
    id: session.id,
    revision: session.revision,
    step: session.step,
    phase: completed
      ? ("complete" as const)
      : revealed
        ? ("revealed" as const)
        : ("forecast" as const),
    edition: editionSummary(edition),
    index,
    current: moment(current.actual),
    prediction: current.prediction,
    strikeZone: estimateStrikeZoneForPitch(
      current.actual,
      current.request.pitcherSessionHistory,
    ),
    actual: revealed ? displayPitch(current.actual) : null,
    evaluation: revealed
      ? evaluatePitch(current.prediction, current.actual)
      : null,
    history,
    summary: completed
      ? {
          pitches: history.length,
          outcome: {
            strikeout: "Strikeout",
            walk: "Walk",
            hit_by_pitch: "Hit by pitch",
            ball_in_play: "Ball in play",
          }[
            applyPitchResult(current.actual.preState, current.actual.result)
              .terminalState!
          ],
          topPicks: history.filter(
            (item) => item.evaluation.pitchTypeRank === 1,
          ).length,
          topTwo: history.filter(
            (item) =>
              item.evaluation.pitchTypeRank !== null &&
              item.evaluation.pitchTypeRank <= 2,
          ).length,
        }
      : null,
  };
}
export type ReplayView = ReturnType<typeof replayView>;

// Select by sequence length and completeness, never model performance or a desirable result.
export function selectFeaturedAtBat(replay: GameReplay): PitchEvent[] {
  if (!["Final", "Game Over", "Completed Early"].includes(replay.game.status))
    throw new Error("Only completed games can be published.");
  const groups = new Map<string, PitchEvent[]>();
  for (const pitch of replay.pitches)
    groups.set(pitch.paId, [...(groups.get(pitch.paId) ?? []), pitch]);
  for (const pitches of groups.values()) {
    if (isCompleteAtBat(pitches)) return pitches;
  }
  throw new Error(
    "This game has no complete three-to-eight-pitch at-bat to feature.",
  );
}

function isCompleteAtBat(pitches: PitchEvent[]): boolean {
  if (pitches.length < 3 || pitches.length > maxFeaturedPitches) return false;
  const first = pitches[0];
  if (
    first.pitchNumber !== 1 ||
    first.preState.count.balls !== 0 ||
    first.preState.count.strikes !== 0
  )
    return false;
  return pitches.every((pitch, index) => {
    if (
      pitch.paId !== first.paId ||
      pitch.gamePitchIndex !== first.gamePitchIndex + index ||
      pitch.pitchNumber !== index + 1 ||
      JSON.stringify(pitch.matchup) !== JSON.stringify(first.matchup)
    )
      return false;
    const outcome = applyPitchResult(pitch.preState, pitch.result);
    if (Boolean(outcome.terminalState) !== (index === pitches.length - 1))
      return false;
    const next = pitches[index + 1];
    return (
      !next ||
      JSON.stringify(next.preState.count) ===
        JSON.stringify(outcome.postState.count)
    );
  });
}

const editionSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  contract: z.literal(replayContract),
  modelArtifact: z.string().min(1),
  sourceUrl: z.url(),
  publishedAt: z.iso.datetime({ offset: true }),
  game: z.object({
    gamePk: z.string().min(1),
    label: z.string().min(1),
    officialDate: z.iso.date(),
    awayTeam: z.string().min(1),
    homeTeam: z.string().min(1),
    awayScore: z.number().int().nonnegative(),
    homeScore: z.number().int().nonnegative(),
    status: z.enum(["Final", "Game Over", "Completed Early"]),
  }),
  pitches: z
    .array(
      z.object({
        actual: pitchEventSchema,
        request: predictionRequestSchema,
        prediction: predictionResponseSchema,
      }),
    )
    .min(3)
    .max(maxFeaturedPitches),
});

export function assertEdition(edition: ReplayEdition): void {
  editionSchema.parse(edition);
  if (new TextEncoder().encode(JSON.stringify(edition)).length > 256_000)
    throw new Error("Replay edition exceeds the publication size limit.");
  const first = edition.pitches[0];
  if (!isCompleteAtBat(edition.pitches.map((item) => item.actual)))
    throw new Error(
      "Edition must contain one complete contiguous at-bat with valid counts.",
    );
  for (const item of edition.pitches) {
    if (item.prediction.modelVersion !== first.prediction.modelVersion)
      throw new Error("Edition mixes model versions.");
    const history = item.request.pitcherSessionHistory;
    if (
      history.some(
        (pitch, i) =>
          pitch.gamePitchIndex >= item.actual.gamePitchIndex ||
          pitch.matchup.pitcherId !== item.actual.matchup.pitcherId ||
          (i > 0 && history[i - 1].gamePitchIndex >= pitch.gamePitchIndex),
      )
    )
      throw new Error(
        "Prediction history contains future, unordered, or mismatched data.",
      );
    const expected = buildPredictionRequest({
      currentPitch: item.actual,
      history,
      gameDate: edition.game.officialDate,
    });
    if (
      JSON.stringify(predictionRequestSchema.parse(item.request)) !==
      JSON.stringify(predictionRequestSchema.parse(expected))
    )
      throw new Error(
        "Prediction context contains future or mismatched pitch data.",
      );
  }
}
