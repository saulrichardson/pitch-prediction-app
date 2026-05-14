import type {
  GameReplay,
  PredictionRequest,
  PredictionResponse,
  Timeline,
  TimelineStartJob
} from "@pitch/domain";
import type { Storage } from "./types";

export const memory = {
  replays: new Map<string, GameReplay>(),
  timelines: new Map<string, Timeline>(),
  timelineStartJobs: new Map<string, TimelineStartJob>(),
  predictions: [] as unknown[],
  audit: [] as unknown[]
};

export class MemoryStorage implements Storage {
  async saveReplay(replay: GameReplay): Promise<GameReplay> {
    memory.replays.set(replay.game.gamePk, replay);
    return replay;
  }

  async getReplay(gamePk: string): Promise<GameReplay | null> {
    return memory.replays.get(gamePk) ?? null;
  }

  async saveTimeline(timeline: Timeline): Promise<Timeline> {
    memory.timelines.set(timeline.id, timeline);
    return timeline;
  }

  async getTimeline(id: string, workspaceId: string): Promise<Timeline | null> {
    const timeline = memory.timelines.get(id);
    return timeline?.workspaceId === workspaceId ? timeline : null;
  }

  async saveTimelineStartJob(job: TimelineStartJob): Promise<TimelineStartJob> {
    memory.timelineStartJobs.set(job.id, job);
    return job;
  }

  async getTimelineStartJob(id: string, workspaceId?: string): Promise<TimelineStartJob | null> {
    const job = memory.timelineStartJobs.get(id);
    if (!job) return null;
    if (workspaceId && job.workspaceId !== workspaceId) return null;
    return job;
  }

  async savePredictionRun(run: { timelineId: string; pitchMoment: number; request: PredictionRequest; response: PredictionResponse }): Promise<void> {
    memory.predictions.push({ ...run, createdAt: new Date().toISOString() });
  }

  async audit(event: { workspaceId?: string; timelineId?: string; action: string; payload: unknown }): Promise<void> {
    memory.audit.push({ ...event, createdAt: new Date().toISOString() });
  }
}
