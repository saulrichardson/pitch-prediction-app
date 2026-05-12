import { evaluatePitch } from "./state";
import type {
  GameReplay,
  PitchEvent,
  PredictionResponse,
  Timeline
} from "./types";

export type PredictionContext = Pick<Timeline, "id" | "game" | "actualPitches">;
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
    actualPitches: input.replay.pitches
  }, [], 0);

  return {
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
      actualRevealed: true,
      updatedAt: now
    },
    pitch: previousPitch,
    evaluation: previousForecast.evaluation
  };
}

function cryptoId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}
