import type {
  ClientTimeline,
  ClientTimelineBranch,
  PitchEvent,
  PitchMoment,
  Timeline,
  TimelineBranch
} from "@pitch/domain";

export type ReplaySummaryDto = {
  game: Timeline["game"];
  pitchCount: number;
};

export function toClientTimeline(timeline: Timeline): ClientTimeline {
  const { actualPitches, branches, ...rest } = timeline;
  const currentPitch = actualPitches[timeline.currentPitchIndex] ?? null;
  const nextPitch = timeline.actualRevealed ? actualPitches[timeline.currentPitchIndex + 1] ?? null : null;

  return {
    ...rest,
    currentPitch: currentPitch ? toPitchMoment(currentPitch) : null,
    nextPitchContext: nextPitch ? toPitchMoment(nextPitch) : null,
    actualPitchCount: actualPitches.length,
    branches: branches.map(toClientBranch)
  };
}

export function toReplaySummary(replay: { game: NonNullable<Timeline["game"]>; pitches: PitchEvent[] }): ReplaySummaryDto {
  return {
    game: replay.game,
    pitchCount: replay.pitches.length
  };
}

function toPitchMoment(pitch: PitchEvent): PitchMoment {
  return {
    id: pitch.id,
    paId: pitch.paId,
    pitchNumber: pitch.pitchNumber,
    gamePitchIndex: pitch.gamePitchIndex,
    source: pitch.source,
    preState: pitch.preState,
    matchup: pitch.matchup
  };
}

function toClientBranch(branch: TimelineBranch): ClientTimelineBranch {
  return {
    ...branch,
    replacementSummary: branch.label
  };
}
