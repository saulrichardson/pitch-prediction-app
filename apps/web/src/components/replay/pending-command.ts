import {
  commandSchema,
  type ReplayCommand,
  type ReplayView,
} from "@pitch/domain";

export type PendingCommand = { replayId: string; command: ReplayCommand };

// An unacknowledged intent survives refresh. A later server revision settles it.
export function unresolvedCommand(
  raw: string | null,
  replay: Pick<ReplayView, "id" | "revision">,
): PendingCommand | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingCommand>;
    const parsed = commandSchema.safeParse(value.command);
    return value.replayId === replay.id &&
      parsed.success &&
      parsed.data.expectedRevision === replay.revision
      ? { replayId: replay.id, command: parsed.data }
      : null;
  } catch {
    return null;
  }
}
