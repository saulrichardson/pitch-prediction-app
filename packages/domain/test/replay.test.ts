import { describe, expect, it } from "vitest";
import {
  applyReplayCommand,
  assertEdition,
  replayView,
  selectFeaturedAtBat,
  type ReplaySession,
  type ReplayCommand,
  type ReplayEdition,
} from "../src";
import { fixtureEdition } from "../../../tests/fixtures/replay";
const edition = fixtureEdition();
const initial: ReplaySession = {
  id: edition.id,
  editionId: edition.id,
  workspaceId: "one",
  step: 0,
  revision: 0,
  lastCommand: null,
  createdAt: "2026-09-12T00:00:00Z",
  updatedAt: "2026-09-12T00:00:00Z",
  expiresAt: 9999999999,
};
const command = (session: ReplaySession, action: ReplayCommand["action"]) => ({
  id: crypto.randomUUID(),
  expectedRevision: session.revision,
  action,
});
const step = (session: ReplaySession, action: ReplayCommand["action"]) =>
  applyReplayCommand(session, command(session, action), 4, initial.updatedAt);

describe("prepared replay navigation", () => {
  it("reveals, advances, returns and preserves exact forecasts", () => {
    const revealed = step(initial, "reveal");
    const second = step(revealed, "next");
    const revisited = step(step(second, "back"), "next");
    expect(replayView(second, edition).prediction).toEqual(
      replayView(revisited, edition).prediction,
    );
    expect(replayView(second, edition).actual).toBeNull();
    expect(replayView(second, edition).history).toHaveLength(1);
  });
  it("deduplicates the same command and rejects stale or invalid actions", () => {
    const reveal = command(initial, "reveal");
    const next = applyReplayCommand(initial, reveal, 4, initial.updatedAt);
    expect(applyReplayCommand(next, reveal, 4, initial.updatedAt)).toBe(next);
    expect(() =>
      applyReplayCommand(
        next,
        { ...reveal, action: "next" },
        4,
        initial.updatedAt,
      ),
    ).toThrow();
    expect(() => step(initial, "next")).toThrow();
    expect(() => step(initial, "back")).toThrow();
    expect(() =>
      applyReplayCommand(
        next,
        command(initial, "reveal"),
        4,
        initial.updatedAt,
      ),
    ).toThrow();
  });
  it("withholds every future actual and final score and does not leak requests", () => {
    const view = replayView(initial, edition);
    expect(view.actual).toBeNull();
    expect(view.history).toEqual([]);
    expect(view.summary).toBeNull();
    expect(view.current).not.toHaveProperty("result");
    expect(view.current).not.toHaveProperty("location");
    expect(view.edition.game).not.toHaveProperty("awayScore");
    expect(JSON.stringify(view)).not.toContain(
      "Francisco Lindor strikes out swinging",
    );
    expect(view).not.toHaveProperty("request");
  });
  it("finishes on final reveal and restores an unchanged replay", () => {
    let current = initial;
    for (let i = 0; i < 4; i++) {
      current = step(current, "reveal");
      if (i < 3) current = step(current, "next");
    }
    const view = replayView(current, edition);
    expect(view.phase).toBe("complete");
    expect(view.actual?.result).toBe("whiff");
    expect(view.summary?.pitches).toBe(4);
    expect(() => step(current, "next")).toThrow();
    expect(replayView(step(current, "restart"), edition).prediction).toEqual(
      edition.pitches[0].prediction,
    );
    expect(replayView(step(current, "back"), edition).phase).toBe("forecast");
  });
  it("selects a complete bounded at-bat and rejects future prediction context", () => {
    const replay = {
      game: edition.game,
      pitches: edition.pitches.map((item) => item.actual),
    };
    expect(selectFeaturedAtBat(replay)).toHaveLength(4);
    expect(() =>
      selectFeaturedAtBat({
        ...replay,
        game: { ...replay.game, status: "In Progress" },
      }),
    ).toThrow();
    assertEdition(edition);
    const invalid = structuredClone(edition);
    invalid.pitches[0].request.pitcherSessionHistory = [
      edition.pitches[1].actual,
    ];
    expect(() => assertEdition(invalid)).toThrow("future");
  });
  it("rejects malformed publication data before a visitor can open it", () => {
    const mutations: Array<(edition: ReplayEdition) => void> = [
      (value) => {
        value.pitches[0].prediction.pitchMix = [];
      },
      (value) => {
        value.pitches[0].prediction.pitchMix[0].probability = 0.1;
      },
      (value) => {
        value.pitches[1].prediction.modelVersion = "different-model";
      },
      (value) => {
        value.pitches[1].actual.preState.count.balls = 3;
      },
      (value) => {
        value.pitches[0].request.currentPaHistory = [value.pitches[2].actual];
      },
      (value) => {
        value.pitches.pop();
      },
      (value) => {
        value.pitches[0].request.strikeZone = { top: 1, bottom: 4 };
      },
      (value) => {
        value.pitches[0].prediction.velocity[0].sampleCount = 100;
      },
    ];
    for (const mutate of mutations) {
      const copy = structuredClone(edition);
      mutate(copy);
      expect(() => assertEdition(copy)).toThrow();
    }
  });
  it("accepts a complete edition after storage reorders object fields", () => {
    const persisted = JSON.parse(JSON.stringify(edition)) as ReplayEdition;
    persisted.pitches.forEach((item, index) => {
      for (const pitch of [item.actual, ...item.request.pitcherSessionHistory])
        pitch.shape.release = { x: 1, z: 2 };
      for (const pitch of item.request.currentPaHistory)
        pitch.shape.release = { z: 2, x: 1 };
      const { balls, strikes } = item.actual.preState.count;
      item.actual.preState.count = { strikes, balls };
      if (index % 2) {
        const matchup = item.actual.matchup;
        item.actual.matchup = {
          batterSide: matchup.batterSide,
          batterName: matchup.batterName,
          batterId: matchup.batterId,
          pitcherHand: matchup.pitcherHand,
          pitcherName: matchup.pitcherName,
          pitcherId: matchup.pitcherId,
        };
      }
    });
    expect(() => assertEdition(persisted)).not.toThrow();
    expect(
      selectFeaturedAtBat({
        game: persisted.game,
        pitches: persisted.pitches.map((item) => item.actual),
      }),
    ).toHaveLength(4);
  });
});
