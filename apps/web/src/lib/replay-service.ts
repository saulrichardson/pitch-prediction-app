import { getStorage, type Storage } from "@pitch/db";
import {
  applyReplayCommand,
  assertEdition,
  editionSummary,
  ReplayConflict,
  replayView,
  replayContract,
  type ReplayCommand,
  type ReplayEdition,
  type ReplaySession,
} from "@pitch/domain";
import { conflict, notFound, serviceUnavailable } from "./http";
import { indexGameEdition, readEdition } from "@pitch/workflows";

// Validated immutable editions only; every session/cursor still uses durable reads.
const editionCaches = new WeakMap<Storage, Map<string, ReplayEdition>>();
import type { CatalogGame } from "@pitch/domain";

export function replayService(storage: Storage, now = () => new Date()) {
  const cache = editionCaches.get(storage) ?? new Map<string, ReplayEdition>();
  editionCaches.set(storage, cache);
  const sessionKey = (id: string, workspace: string) =>
    `session:${workspace}:${id}`;
  async function edition(id: string): Promise<ReplayEdition> {
    let prepared = cache.get(id);
    if (!prepared) {
      prepared = (await readEdition(storage, id)) ?? undefined;
      if (prepared) {
        if (cache.size >= 4) cache.delete(cache.keys().next().value!);
        cache.set(id, prepared);
      }
    }
    if (!prepared)
      throw notFound(
        "This replay is no longer available.",
        "edition_not_found",
      );
    if (prepared.contract !== replayContract) {
      const indexed = await storage.read<{ editionId: string }>(
        `game-edition:${prepared.game.gamePk}`,
      );
      if (indexed && indexed.value.editionId !== id) {
        const fullGame = await edition(indexed.value.editionId);
        if (
          fullGame.contract === replayContract &&
          fullGame.game.gamePk === prepared.game.gamePk
        )
          return fullGame;
      }
    }
    return prepared;
  }
  async function load(
    id: string,
    workspace: string,
  ): Promise<{ session: ReplaySession; edition: ReplayEdition }> {
    const record = await storage.read<ReplaySession>(sessionKey(id, workspace));
    if (!record || record.value.workspaceId !== workspace)
      throw notFound("Start this replay to continue.", "session_not_found");
    const prepared = await edition(record.value.editionId);
    if (prepared.id !== record.value.editionId) {
      const old = await readEdition(storage, record.value.editionId);
      if (!old)
        throw notFound(
          "This replay is no longer available.",
          "edition_not_found",
        );
      const previousPitch =
        old.pitches[Math.floor(record.value.step / 2)].actual;
      const index = prepared.pitches.findIndex(
        (item) => item.actual.gamePitchIndex === previousPitch.gamePitchIndex,
      );
      if (index < 0)
        throw new Error("Saved place is missing from the full game.");
      const migrated = {
        ...record.value,
        editionId: prepared.id,
        step: index * 2 + (record.value.step % 2),
        revision: record.revision + 1,
        lastCommand: null,
        updatedAt: now().toISOString(),
      };
      if (
        !(await storage.write(
          { ...record, revision: migrated.revision, value: migrated },
          record.revision,
        ))
      )
        return load(id, workspace);
      return { session: migrated, edition: prepared };
    }
    return { session: record.value, edition: prepared };
  }
  return {
    async featured() {
      const featured = await storage.read<{ editionId: string }>("featured");
      if (!featured)
        throw serviceUnavailable(
          "The next replay is being prepared. Check back soon.",
          "replay_unavailable",
        );
      return editionSummary(await edition(featured.value.editionId));
    },
    async start(id: string, workspace: string) {
      const prepared = await edition(id);
      const timestamp = now();
      const session: ReplaySession = {
        id,
        editionId: prepared.id,
        workspaceId: workspace,
        revision: 0,
        step: 0,
        lastCommand: null,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
        expiresAt: Math.floor(timestamp.getTime() / 1000) + 14 * 86400,
      };
      const saved = await storage.write(
        {
          key: sessionKey(id, workspace),
          revision: 0,
          value: session,
          expiresAt: session.expiresAt,
        },
        null,
      );
      if (saved) return replayView(session, prepared);
      const current = await load(id, workspace);
      return replayView(current.session, current.edition);
    },
    async read(id: string, workspace: string) {
      const current = await load(id, workspace);
      return replayView(current.session, current.edition);
    },
    async command(id: string, workspace: string, command: ReplayCommand) {
      const current = await load(id, workspace);
      try {
        const next = applyReplayCommand(
          current.session,
          command,
          current.edition.pitches.length,
          now().toISOString(),
        );
        if (next === current.session) return replayView(next, current.edition);
        const saved = await storage.write(
          {
            key: sessionKey(id, workspace),
            revision: next.revision,
            value: next,
            expiresAt: next.expiresAt,
          },
          current.session.revision,
        );
        if (!saved) {
          const latest = await load(id, workspace);
          if (latest.session.lastCommand?.id === command.id) {
            applyReplayCommand(
              latest.session,
              command,
              latest.edition.pitches.length,
              now().toISOString(),
            );
            return replayView(latest.session, latest.edition);
          }
          throw new ReplayConflict();
        }
        return replayView(next, current.edition);
      } catch (error) {
        if (error instanceof ReplayConflict)
          throw conflict(error.message, "replay_changed");
        throw error;
      }
    },
  };
}

let localEditionLoaded: Promise<void> | undefined;
export async function getReplayService() {
  const storage = getStorage();
  // Explicit local input for real preparation output and deterministic browser tests.
  // Never lets a deployed server load arbitrary filesystem fixtures.
  if (
    process.env.REPLAY_EDITION_PATH &&
    process.env.STORAGE_MODE === "memory" &&
    process.env.NODE_ENV !== "production"
  ) {
    localEditionLoaded ??= (async () => {
      const { readFile } = await import("node:fs/promises");
      const edition = JSON.parse(
        await readFile(process.env.REPLAY_EDITION_PATH!, "utf8"),
      ) as ReplayEdition & {
        testCatalog?: {
          editions: ReplayEdition[];
          schedules: Record<string, CatalogGame[]>;
        };
      };
      assertEdition(edition);
      await storage.write(
        { key: `edition:${edition.id}`, revision: 0, value: edition },
        null,
      );
      await storage.write(
        { key: "featured", revision: 0, value: { editionId: edition.id } },
        null,
      );
      await indexGameEdition(storage, edition);
      // This fixture bundle is only reachable in explicitly configured local memory mode.
      if (edition.testCatalog) {
        for (const extra of edition.testCatalog.editions) {
          assertEdition(extra);
          await storage.write(
            { key: `edition:${extra.id}`, revision: 0, value: extra },
            null,
          );
          await indexGameEdition(storage, extra);
        }
        await storage.write(
          {
            key: "schedule:dodgers-recent-v1",
            revision: 0,
            value: {
              fetchedAt: new Date(Date.now() + 86400_000).toISOString(),
              games: Object.values(edition.testCatalog.schedules).flat(),
            },
          },
          null,
        );
      }
    })();
    await localEditionLoaded;
  }
  return replayService(storage);
}
