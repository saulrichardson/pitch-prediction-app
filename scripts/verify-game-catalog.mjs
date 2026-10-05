import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
async function get(path) {
  const response = await fetch(new URL(path, base));
  return { response, body: await response.json() };
}
const current = await get("/api/games");
assert.equal(current.response.status, 200);
assert.equal(current.body.games.length, 10);
assert.equal(current.response.headers.get("cache-control"), "no-store");
assert.equal(new Set(current.body.games.map((game) => game.gamePk)).size, 10);
for (const [index, game] of current.body.games.entries()) {
  assert.equal(game.status, "complete");
  assert.ok(game.away.id === 119 || game.home.id === 119);
  assert.match(game.gamePk, /^\d+$/);
  assert.ok(
    !JSON.stringify(game).match(
      /awayScore|homeScore|isWinner|"score"|"actual"|"prediction"/,
    ),
  );
  if (index) assert.ok(current.body.games[index - 1].startsAt >= game.startsAt);
  if (game.replay.status === "ready") {
    assert.equal(game.replay.edition.scope, "game");
    assert.equal(game.replay.edition.game.gamePk, game.gamePk);
  }
}
assert.equal((await get("/api/games?date=2026-02-30")).response.status, 400);
const requestBody = JSON.stringify({ date: current.body.date });
for (const [id, status] of [
  ["not-a-game", 400],
  ["823496", 404],
]) {
  const invalid = await fetch(new URL(`/api/games/${id}`, base), {
    method: "POST",
    body: requestBody,
    headers: {
      "content-type": "application/json",
      origin: new URL(base).origin,
      "x-amz-content-sha256": createHash("sha256")
        .update(requestBody)
        .digest("hex"),
    },
  });
  assert.equal(invalid.status, status);
}
console.log(
  "PASS ten completed Dodgers games, descending order, spoiler redaction, full-game editions, and unsupported-game rejection",
);
