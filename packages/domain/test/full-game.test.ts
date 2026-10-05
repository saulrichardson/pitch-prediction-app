import { describe, it, expect } from "vitest";
import {
  applyReplayCommand,
  assertEdition,
  replayView,
  selectFullGame,
  type ReplaySession,
} from "../src";
import { fixtureGameEdition } from "../../../tests/fixtures/replay";

describe("full game replays", () => {
  it("includes every pitch across batters, pitching changes and all nine innings", () => {
    const edition = fixtureGameEdition();
    assertEdition(edition);
    expect(
      selectFullGame({
        game: edition.game,
        pitches: edition.pitches.map((p) => p.actual),
      }),
    ).toHaveLength(72);
    let session: ReplaySession = {
      id: edition.id,
      editionId: edition.id,
      workspaceId: "test",
      step: 0,
      revision: 0,
      lastCommand: null,
      createdAt: edition.publishedAt,
      updatedAt: edition.publishedAt,
      expiresAt: 9999999999,
    };
    const advance = (action: "next" | "reveal") => {
      session = applyReplayCommand(
        session,
        { action, id: crypto.randomUUID(), expectedRevision: session.revision },
        72,
        edition.publishedAt,
      );
      return replayView(session, edition);
    };
    for (let index = 0; index < 72; index++) {
      const before = replayView(session, edition);
      expect(before.index).toBe(index);
      expect(before.actual).toBeNull();
      expect(before.summary).toBeNull();
      expect(before.current.matchup).toEqual(
        edition.pitches[index].actual.matchup,
      );
      expect(before.current.preState).toEqual(
        edition.pitches[index].actual.preState,
      );
      expect(before.history).toHaveLength(index);
      const after = advance("reveal");
      expect(after.phase).toBe(index === 71 ? "complete" : "revealed");
      if (index < 71) advance("next");
    }
    expect(replayView(session, edition).summary).toMatchObject({
      pitches: 72,
      outcome: "NYM @ MIA · 3–2",
    });
  });
  it("retains extra innings and rejects missing or reordered pitches", () => {
    const game = fixtureGameEdition(12);
    assertEdition(game);
    expect(game.pitches.at(-1)?.actual.preState.inning).toBe(12);
    const shortened = structuredClone(game);
    shortened.pitches.pop();
    expect(() => assertEdition(shortened)).toThrow("missing recorded pitches");
    const gap = structuredClone(game);
    gap.pitches.splice(20, 1);
    gap.totalPitches = gap.pitches.length;
    expect(() => assertEdition(gap)).toThrow("recorded order");
  });
  it("rejects omitted past history and future context even deep into the game", () => {
    const game = fixtureGameEdition();
    game.pitches[60].request.pitcherSessionHistory = [];
    expect(() => assertEdition(game)).toThrow("mismatched");
  });
});
