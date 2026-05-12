import type {
  GameReplay,
  PredictionRequest,
  PredictionResponse,
  Timeline
} from "@pitch/domain";
import type { Storage } from "./types";

export const memory = {
  replays: new Map<string, GameReplay>(),
  timelines: new Map<string, Timeline>(),
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

  async savePredictionRun(run: { timelineId: string; pitchMoment: number; request: PredictionRequest; response: PredictionResponse }): Promise<void> {
    memory.predictions.push({ ...run, createdAt: new Date().toISOString() });
  }

  async audit(event: { workspaceId?: string; timelineId?: string; action: string; payload: unknown }): Promise<void> {
    memory.audit.push({ ...event, createdAt: new Date().toISOString() });
  }
}
