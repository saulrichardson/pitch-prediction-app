import type {
  GameReplay,
  PredictionRequest,
  PredictionResponse,
  Timeline
} from "@pitch/domain";

export interface Storage {
  saveReplay(replay: GameReplay, raw?: unknown): Promise<GameReplay>;
  getReplay(gamePk: string): Promise<GameReplay | null>;
  saveTimeline(timeline: Timeline): Promise<Timeline>;
  getTimeline(id: string, workspaceId: string): Promise<Timeline | null>;
  savePredictionRun(run: {
    timelineId: string;
    pitchMoment: number;
    request: PredictionRequest;
    response: PredictionResponse;
  }): Promise<void>;
  audit(event: { workspaceId?: string; timelineId?: string; action: string; payload: unknown }): Promise<void>;
}
