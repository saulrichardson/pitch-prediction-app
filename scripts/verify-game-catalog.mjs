import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
async function get(path) {
  const response = await fetch(new URL(path, base));
  return { response, body: await response.json() };
}
const current = await get("/api/games");
assert.equal(current.response.status, 200);
assert.equal(current.body.window.dates.length, 7);
assert.equal(current.body.date, current.body.window.end);
assert.equal(current.response.headers.get("cache-control"), "no-store");
let totalGames = 0;
for (const date of current.body.window.dates) {
  const { response, body } =
    date === current.body.date ? current : await get(`/api/games?date=${date}`);
  assert.equal(response.status, 200);
  assert.equal(body.date, date);
  for (const game of body.games) {
    assert.equal(game.date, date);
    assert.match(game.gamePk, /^\d+$/);
    assert.ok(game.away.name && game.home.name);
    assert.ok(
      !JSON.stringify(game).match(
        /awayScore|homeScore|isWinner|"score"|"actual"|"prediction"/,
      ),
    );
    if (game.replay.status === "ready")
      assert.equal(game.replay.edition.game.gamePk, game.gamePk);
  }
  totalGames += body.games.length;
}
const outside = new Date(`${current.body.window.start}T12:00:00Z`);
outside.setUTCDate(outside.getUTCDate() - 1);
assert.equal(
  (await get(`/api/games?date=${outside.toISOString().slice(0, 10)}`)).response
    .status,
  400,
);
assert.equal((await get("/api/games?date=2026-02-30")).response.status, 400);
const requestBody = JSON.stringify({ date: current.body.date });
const invalid = await fetch(new URL("/api/games/not-a-game", base), {
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
assert.equal(invalid.status, 400);
console.log(
  `PASS seven-day catalog, ${totalGames} games, spoiler redaction, cached editions, and date/game validation`,
);
