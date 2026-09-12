export type ModelIdentity = { target: string; artifact: string };
export type GamePreparationJob = {
  gamePk: string;
  date: string;
  requestId: string;
  createdAt: string;
  updatedAt: string;
  completed: number;
  total: number | null;
  model?: ModelIdentity;
} & (
  | { status: "queued" | "preparing" }
  | { status: "ready"; editionId: string }
  | {
      status: "failed";
      message: string;
      retryAt: string | null;
      retryable: boolean;
    }
);

export const jobKey = (id: string) => `game-job:${id}`;
export const gameEditionKey = (id: string) => `game-edition:${id}`;
export const catalogEditionsKey = (date: string) => `catalog-editions:${date}`;
export const preparationStaleMs = 10 * 60_000;

export function preparationIsStale(job: GamePreparationJob, now: Date) {
  return (
    (job.status === "queued" || job.status === "preparing") &&
    now.getTime() - Date.parse(job.updatedAt) > preparationStaleMs
  );
}
