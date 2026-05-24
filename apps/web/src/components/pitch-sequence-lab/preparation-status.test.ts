import { describe, expect, it } from "vitest";
import type { ClientTimelineStartJob } from "@pitch/domain";
import { replayPreparationStatus } from "./preparation-status";

describe("replay preparation status", () => {
  it("explains the non-job game-loading phase", () => {
    expect(replayPreparationStatus({
      message: "Loading latest game and pitch feed",
      nowMs: Date.parse("2026-05-24T12:00:00.000Z")
    })).toMatchObject({
      headline: "Loading latest game and pitch feed",
      elapsedLabel: null,
      steps: [
        { label: "Game feed", state: "active" },
        { label: "Worker claim", state: "waiting" },
        { label: "Model boot", state: "waiting" },
        { label: "Replay open", state: "waiting" }
      ]
    });
  });

  it("tells users when a cold model start is expected", () => {
    const view = replayPreparationStatus({
      job: jobFixture({
        status: "running",
        startedAt: "2026-05-24T12:00:00.000Z"
      }),
      nowMs: Date.parse("2026-05-24T12:00:55.000Z")
    });

    expect(view).toMatchObject({
      headline: "Still warming the model",
      elapsedLabel: "55s elapsed"
    });
    expect(view.detail).toContain("first request after idle");
    expect(view.steps).toContainEqual({ label: "Model boot", state: "active" });
  });

  it("formats multi-minute waits without implying failure", () => {
    const view = replayPreparationStatus({
      job: jobFixture({
        status: "running",
        startedAt: "2026-05-24T12:00:00.000Z"
      }),
      nowMs: Date.parse("2026-05-24T12:02:03.000Z")
    });

    expect(view.elapsedLabel).toBe("2m 03s elapsed");
    expect(view.headline).toBe("Still warming the model");
  });
});

function jobFixture(overrides: Partial<ClientTimelineStartJob> = {}): ClientTimelineStartJob {
  return {
    id: "job-1",
    gamePk: "game-1",
    status: "pending",
    timelineId: null,
    error: null,
    attempts: 0,
    createdAt: "2026-05-24T12:00:00.000Z",
    updatedAt: "2026-05-24T12:00:00.000Z",
    startedAt: null,
    completedAt: null,
    ...overrides
  };
}
