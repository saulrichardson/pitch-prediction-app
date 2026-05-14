import {
  advanceActualTimeline,
  buildPredictionRequest,
  createActualTimeline,
  revealCurrentPitch,
  stepBackActualTimeline,
  type PredictionContext,
  type Timeline
} from "@pitch/domain";
import { getStorage } from "@pitch/db";
import { predictPitch } from "./model-service";
import { conflict, notFound } from "./http";

export type TimelinePredictionOptions = {
  predictionTimeoutMs?: number;
};

export async function createTimelineFromReplay(
  workspaceId: string,
  replayId: string,
  replayLoader: () => Promise<Parameters<typeof createActualTimeline>[0]["replay"]>,
  options: TimelinePredictionOptions = {}
) {
  const replay = await replayLoader();
  if (replay.game.gamePk !== replayId) throw new Error("Replay loader returned a different game.");
  const timeline = await createActualTimeline({
    workspaceId,
    replay,
    predict: (context, history, pitchIndex) => predictionForTimeline(context, history, pitchIndex, options)
  });
  await getStorage().saveTimeline(timeline);
  await getStorage().audit({ workspaceId, timelineId: timeline.id, action: "timeline.created", payload: { gamePk: replayId } });
  return timeline;
}

export async function revealTimelinePitch(timeline: Timeline) {
  const result = await withTimelineConflict(() => revealCurrentPitch(timeline));
  await getStorage().saveTimeline(result.timeline);
  await getStorage().audit({ workspaceId: timeline.workspaceId, timelineId: timeline.id, action: "timeline.revealed", payload: result.evaluation });
  return result;
}

export async function advanceTimeline(timeline: Timeline) {
  assertCanAdvance(timeline);
  const next = await advanceActualTimeline(timeline, predictionForTimeline);
  await getStorage().saveTimeline(next);
  await getStorage().audit({ workspaceId: timeline.workspaceId, timelineId: timeline.id, action: "timeline.advanced", payload: { pitchIndex: next.currentPitchIndex } });
  return next;
}

export async function stepBackTimeline(timeline: Timeline) {
  const result = await withTimelineConflict(() => stepBackActualTimeline(timeline));
  await getStorage().saveTimeline(result.timeline);
  await getStorage().audit({
    workspaceId: timeline.workspaceId,
    timelineId: timeline.id,
    action: "timeline.stepped_back",
    payload: { pitchIndex: result.timeline.currentPitchIndex, actualRevealed: result.timeline.actualRevealed }
  });
  return result;
}

export async function loadTimeline(id: string, workspaceId: string) {
  const timeline = await getStorage().getTimeline(id, workspaceId);
  if (!timeline) throw notFound("Timeline not found.", "timeline_not_found");
  return timeline;
}

async function predictionForTimeline(
  timeline: PredictionContext,
  history: Timeline["actualHistory"],
  pitchIndex: number,
  options: TimelinePredictionOptions = {}
) {
  const currentPitch = timeline.actualPitches[pitchIndex];
  if (!currentPitch) throw new Error("No current pitch is available for prediction.");
  const request = buildPredictionRequest({
    currentPitch,
    history,
    gameDate: timeline.game.officialDate,
    pitchNumber: pitchIndex + 1
  });
  const response = await predictPitch(request, { timeoutMs: options.predictionTimeoutMs });
  await getStorage().savePredictionRun({
    timelineId: timeline.id,
    pitchMoment: pitchIndex,
    request,
    response
  });
  return response;
}

async function withTimelineConflict<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error) {
      throw conflict(error.message, "invalid_timeline_transition");
    }
    throw error;
  }
}

function assertCanAdvance(timeline: Timeline) {
  if (!timeline.actualPitches[timeline.currentPitchIndex]) {
    throw conflict("No pitch is available to advance.", "invalid_timeline_transition");
  }
  if (!timeline.actualRevealed) {
    throw conflict("Reveal the actual pitch before advancing.", "invalid_timeline_transition");
  }
}
