import {
  buildForcedPitch,
  compareProbabilities,
  evaluatePitch
} from "./state";
import type {
  BranchComparison,
  ForcedPitchInput,
  GameReplay,
  ManualSituation,
  PitchEvent,
  PredictionResponse,
  Timeline,
  TimelineBranch
} from "./types";

export type PredictionContext = Pick<Timeline, "id" | "game" | "manualSituation" | "actualPitches">;
export type PredictFn = (context: PredictionContext, history: PitchEvent[], pitchIndex: number) => Promise<PredictionResponse>;

export async function createActualTimeline(input: {
  workspaceId: string;
  replay: GameReplay;
  predict: PredictFn;
}): Promise<Timeline> {
  if (input.replay.pitches.length === 0) throw new Error("Cannot create a timeline without pitches.");
  const now = new Date().toISOString();
  const id = cryptoId("timeline");
  const prediction = await input.predict({
    id,
    game: input.replay.game,
    manualSituation: null,
    actualPitches: input.replay.pitches
  }, [], 0);
  const baseTimeline: Timeline = {
    id,
    workspaceId: input.workspaceId,
    mode: "real-game",
    game: input.replay.game,
    actualPitches: input.replay.pitches,
    currentPitchIndex: 0,
    actualHistory: [],
    actualForecastHistory: [],
    actualPrediction: prediction,
    actualRevealed: false,
    activeBranchId: null,
    branches: [],
    manualSituation: null,
    createdAt: now,
    updatedAt: now
  };
  return baseTimeline;
}

export async function createManualTimeline(input: {
  workspaceId: string;
  manualSituation: ManualSituation;
  predict: PredictFn;
}): Promise<Timeline> {
  const history = [...input.manualSituation.pitchHistory];
  const synthetic = {
    id: cryptoId("manual-current"),
    paId: "manual-pa",
    pitchNumber: history.length + 1,
    gamePitchIndex: history.length,
    source: "alternate" as const,
    pitchType: "FF" as const,
    result: "called_strike" as const,
    location: { px: 0, pz: 2.5, zone: 5, label: "Middle" as const },
    shape: { velocity: 94, spin: null, release: {}, movement: {} },
    preState: input.manualSituation.state,
    postState: input.manualSituation.state,
    matchup: input.manualSituation.matchup,
    description: "Manual current situation"
  };
  const now = new Date().toISOString();
  const id = cryptoId("timeline");
  const actualPitches = [...history, synthetic];
  const game = {
    gamePk: "manual",
    label: "Manual Situation",
    officialDate: input.manualSituation.gameDate,
    awayTeam: "Away",
    homeTeam: "Home",
    awayScore: input.manualSituation.state.awayScore,
    homeScore: input.manualSituation.state.homeScore,
    status: "Manual"
  };
  const timelineContext = {
    id,
    game,
    manualSituation: input.manualSituation,
    actualPitches
  };

  return {
    id,
    workspaceId: input.workspaceId,
    mode: "manual",
    game: null,
    actualPitches,
    currentPitchIndex: history.length,
    actualHistory: history,
    actualForecastHistory: [],
    actualPrediction: await input.predict(timelineContext, history, history.length),
    actualRevealed: false,
    activeBranchId: null,
    branches: [],
    manualSituation: input.manualSituation,
    createdAt: now,
    updatedAt: now
  };
}

export function revealCurrentPitch(timeline: Timeline) {
  const pitch = timeline.actualPitches[timeline.currentPitchIndex];
  if (!pitch) throw new Error("No pitch is available to reveal.");
  const evaluation = evaluatePitch(timeline.actualPrediction, pitch);
  return {
    timeline: { ...timeline, actualRevealed: true, updatedAt: new Date().toISOString() },
    pitch,
    evaluation
  };
}

export async function advanceActualTimeline(timeline: Timeline, predict: PredictFn): Promise<Timeline> {
  const pitch = timeline.actualPitches[timeline.currentPitchIndex];
  if (!pitch) throw new Error("No pitch is available to advance.");
  if (!timeline.actualRevealed) throw new Error("Reveal the actual pitch before advancing.");
  const nextIndex = timeline.currentPitchIndex + 1;
  const nextPitch = timeline.actualPitches[nextIndex];
  const currentPitchWasCommitted = Boolean(
    timeline.actualHistory.at(-1)?.id === pitch.id &&
    timeline.actualForecastHistory.at(-1)?.pitchIndex === timeline.currentPitchIndex
  );
  const history = currentPitchWasCommitted ? timeline.actualHistory : [...timeline.actualHistory, pitch];
  const forecastHistory = currentPitchWasCommitted
    ? timeline.actualForecastHistory
    : [
        ...(timeline.actualForecastHistory ?? []),
        {
          pitchId: pitch.id,
          pitchIndex: timeline.currentPitchIndex,
          prediction: timeline.actualPrediction,
          evaluation: evaluatePitch(timeline.actualPrediction, pitch)
        }
      ];
  if (!nextPitch) {
    return {
      ...timeline,
      actualHistory: history,
      actualForecastHistory: forecastHistory,
      actualRevealed: true,
      updatedAt: new Date().toISOString()
    };
  }

  const nextTimeline = {
    ...timeline,
    currentPitchIndex: nextIndex,
    actualHistory: history,
    actualForecastHistory: forecastHistory,
    activeBranchId: null,
    actualRevealed: false,
    updatedAt: new Date().toISOString()
  };

  return {
    ...nextTimeline,
    actualPrediction: await predict(nextTimeline, history, nextIndex)
  };
}

export function stepBackActualTimeline(timeline: Timeline) {
  const now = new Date().toISOString();

  if (timeline.actualRevealed) {
    const currentPitch = timeline.actualPitches[timeline.currentPitchIndex];
    const currentPitchWasCommitted = Boolean(
      currentPitch &&
      timeline.actualHistory.at(-1)?.id === currentPitch.id &&
      timeline.actualForecastHistory.at(-1)?.pitchIndex === timeline.currentPitchIndex
    );

    return {
      timeline: {
        ...timeline,
        actualHistory: currentPitchWasCommitted ? timeline.actualHistory.slice(0, -1) : timeline.actualHistory,
        actualForecastHistory: currentPitchWasCommitted ? timeline.actualForecastHistory.slice(0, -1) : timeline.actualForecastHistory,
        activeBranchId: null,
        actualRevealed: false,
        updatedAt: now
      },
      pitch: undefined,
      evaluation: undefined
    };
  }

  const previousForecast = timeline.actualForecastHistory.at(-1);
  const previousPitch = timeline.actualHistory.at(-1);

  if (!previousForecast || !previousPitch) {
    throw new Error("No previous replay step is available.");
  }

  const previousIndex = previousForecast.pitchIndex;

  return {
    timeline: {
      ...timeline,
      currentPitchIndex: previousIndex,
      actualHistory: timeline.actualHistory.slice(0, -1),
      actualForecastHistory: timeline.actualForecastHistory.slice(0, -1),
      actualPrediction: previousForecast.prediction,
      activeBranchId: null,
      actualRevealed: true,
      updatedAt: now
    },
    pitch: previousPitch,
    evaluation: previousForecast.evaluation
  };
}

export async function applyAlternatePitch(
  timeline: Timeline,
  input: ForcedPitchInput,
  predict: PredictFn
): Promise<Timeline> {
  return applyBranchPitch(timeline, input, "alternate", predict);
}

async function applyBranchPitch(
  timeline: Timeline,
  input: ForcedPitchInput,
  source: "alternate" | "generated",
  predict: PredictFn
): Promise<Timeline> {
  const active = activeBranch(timeline);
  if (active?.terminalState) {
    throw new Error(`${active.label} has ended. Return to the actual timeline before creating another branch.`);
  }
  const current = activeCurrentPitch(timeline);
  const preState = activeState(timeline);
  const branchId = timeline.activeBranchId ?? cryptoId("branch");
  const existing = timeline.branches.find((branch) => branch.id === branchId);
  const branchHistory = existing?.pitches ?? [];
  const { pitch, terminalState } = buildForcedPitch(input, {
    paId: current.paId,
    pitchNumber: branchHistory.length + 1,
    gamePitchIndex: timeline.currentPitchIndex,
    preState,
    matchup: current.matchup,
    source,
    prediction: existing?.prediction ?? timeline.actualPrediction
  });
  const updatedBranchHistory = [...branchHistory, pitch];
  const prediction = terminalState
    ? existing?.prediction ?? timeline.actualPrediction
    : await branchPrediction(timeline, updatedBranchHistory, predict);
  const branch: TimelineBranch = {
    id: branchId,
    label: existing?.label ?? `Branch ${String.fromCharCode(65 + timeline.branches.length)}`,
    startsAtPitchIndex: existing?.startsAtPitchIndex ?? timeline.currentPitchIndex,
    replacementSummary: existing?.replacementSummary ?? `${pitch.pitchType} ${pitch.location.label.toLowerCase()} instead of ${current.pitchType} ${current.description.toLowerCase()}`,
    pitches: updatedBranchHistory,
    prediction,
    terminalState,
    createdAt: existing?.createdAt ?? new Date().toISOString()
  };

  return upsertBranch(timeline, branch);
}

export async function generateBranchPitch(timeline: Timeline, predict: PredictFn, input?: ForcedPitchInput): Promise<Timeline> {
  const sourcePrediction = activeBranch(timeline)?.prediction ?? timeline.actualPrediction;
  const possible = sourcePrediction.possiblePitches[0];
  const generatedInput = input ?? (possible ? { pitchType: possible.pitchType, location: possible.location.label, result: possible.result } : null);
  if (!generatedInput) throw new Error("The model did not return a possible pitch.");
  return applyBranchPitch(
    timeline,
    generatedInput,
    "generated",
    predict
  ).then((next) => {
    const branch = activeBranch(next);
    if (!branch) return next;
    return upsertBranch(next, { ...branch, label: branch.label.startsWith("Generated") ? branch.label : `Generated ${branch.label}` });
  });
}

export function returnToActual(timeline: Timeline): Timeline {
  return { ...timeline, activeBranchId: null, updatedAt: new Date().toISOString() };
}

export function compareActiveBranch(timeline: Timeline, againstBranchId?: string): BranchComparison {
  const branch = againstBranchId
    ? timeline.branches.find((item) => item.id === againstBranchId)
    : activeBranch(timeline);
  if (!branch) throw new Error("No branch is selected for comparison.");
  return {
    actualTimelineId: timeline.id,
    branchId: branch.id,
    branchLabel: branch.label,
    pitchMixDelta: compareProbabilities(branch.prediction.pitchMix, timeline.actualPrediction.pitchMix),
    resultMixDelta: compareProbabilities(branch.prediction.resultMix, timeline.actualPrediction.resultMix),
    countImpactDelta: compareProbabilities(branch.prediction.countImpact, timeline.actualPrediction.countImpact),
    paForecastDelta: compareProbabilities(branch.prediction.paForecast, timeline.actualPrediction.paForecast)
  };
}

function activeCurrentPitch(timeline: Timeline) {
  const pitch = timeline.actualPitches[timeline.currentPitchIndex];
  if (!pitch) throw new Error("No active pitch.");
  return pitch;
}

function activeState(timeline: Timeline) {
  const branch = activeBranch(timeline);
  const lastBranchPitch = branch?.pitches.at(-1);
  return lastBranchPitch?.postState ?? activeCurrentPitch(timeline).preState;
}

function activeBranch(timeline: Timeline): TimelineBranch | undefined {
  return timeline.branches.find((branch) => branch.id === timeline.activeBranchId);
}

async function branchPrediction(timeline: Timeline, branchHistory: TimelineBranch["pitches"], predict: PredictFn) {
  const current = activeCurrentPitch(timeline);
  const syntheticCurrent = {
    ...current,
    preState: branchHistory.at(-1)?.postState ?? current.preState
  };
  const branchTimeline = { ...timeline, actualPitches: [syntheticCurrent], currentPitchIndex: 0 };
  return predict(branchTimeline, [...timeline.actualHistory, ...branchHistory], 0);
}

function upsertBranch(timeline: Timeline, branch: TimelineBranch): Timeline {
  return {
    ...timeline,
    activeBranchId: branch.id,
    branches: [...timeline.branches.filter((item) => item.id !== branch.id), branch],
    updatedAt: new Date().toISOString()
  };
}

function cryptoId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}
