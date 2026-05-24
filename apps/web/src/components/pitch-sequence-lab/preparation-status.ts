import type { ClientTimelineStartJob } from "@pitch/domain";

export type PreparationStepState = "complete" | "active" | "waiting";

export type PreparationStep = {
  label: string;
  state: PreparationStepState;
};

export type PreparationStatusView = {
  headline: string;
  detail: string;
  elapsedLabel: string | null;
  steps: PreparationStep[];
};

export function replayPreparationStatus({
  job,
  message,
  nowMs = Date.now()
}: {
  job?: ClientTimelineStartJob;
  message?: string;
  nowMs?: number;
}): PreparationStatusView {
  if (!job) {
    return {
      headline: message ?? "Loading game feed",
      detail: "Loading the latest game and replay pitches before the model is asked for a read.",
      elapsedLabel: null,
      steps: buildSteps("loading")
    };
  }

  const elapsedSeconds = elapsedSince(job.startedAt ?? job.createdAt, nowMs);
  const elapsedLabel = elapsedSeconds !== null ? formatElapsed(elapsedSeconds) : null;

  if (job.status === "pending") {
    return {
      headline: "Replay start queued",
      detail: "The serverless app accepted the request and is handing it to the background worker.",
      elapsedLabel,
      steps: buildSteps("pending")
    };
  }

  if (job.status === "running") {
    return {
      headline: runningHeadline(elapsedSeconds),
      detail: runningDetail(elapsedSeconds),
      elapsedLabel,
      steps: buildSteps("running")
    };
  }

  if (job.status === "succeeded") {
    return {
      headline: "Opening replay",
      detail: "The first prediction is ready and the replay cockpit is loading.",
      elapsedLabel,
      steps: buildSteps("succeeded")
    };
  }

  return {
    headline: "Model start failed",
    detail: job.error?.message ?? "The model worker could not prepare the first prediction.",
    elapsedLabel,
    steps: buildSteps("failed")
  };
}

function runningHeadline(elapsedSeconds: number | null) {
  if (elapsedSeconds === null || elapsedSeconds < 18) return "Starting model worker";
  if (elapsedSeconds < 50) return "Loading pitch model";
  return "Still warming the model";
}

function runningDetail(elapsedSeconds: number | null) {
  if (elapsedSeconds === null || elapsedSeconds < 18) {
    return "A Lambda worker has claimed the replay and is preparing the model runtime.";
  }

  if (elapsedSeconds < 50) {
    return "The xLSTM model is loading from a cold serverless container. This keeps idle cost low.";
  }

  return "The first request after idle can take about a minute. The page will open automatically when the prediction is ready.";
}

function buildSteps(stage: "loading" | "pending" | "running" | "succeeded" | "failed"): PreparationStep[] {
  return [
    { label: "Game feed", state: stage === "loading" ? "active" : "complete" },
    { label: "Worker claim", state: stepState(stage, ["pending"], ["running", "succeeded", "failed"]) },
    { label: "Model boot", state: stepState(stage, ["running"], ["succeeded"]) },
    { label: "Replay open", state: stage === "succeeded" ? "active" : "waiting" }
  ];
}

function stepState(
  current: "loading" | "pending" | "running" | "succeeded" | "failed",
  activeStages: Array<typeof current>,
  completeStages: Array<typeof current>
): PreparationStepState {
  if (completeStages.includes(current)) return "complete";
  if (activeStages.includes(current)) return "active";
  return "waiting";
}

function elapsedSince(isoTimestamp: string | null | undefined, nowMs: number): number | null {
  if (!isoTimestamp) return null;
  const startedMs = Date.parse(isoTimestamp);
  if (!Number.isFinite(startedMs)) return null;
  return Math.max(0, Math.floor((nowMs - startedMs) / 1000));
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s elapsed`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s elapsed`;
}
