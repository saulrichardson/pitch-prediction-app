#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const timings = [];
const checks = [];
function client() {
  let cookie = "";
  return async (path, body, extraHeaders = {}) => {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const headers = { cookie, ...extraHeaders };
    if (serialized !== undefined) {
      headers["content-type"] = "application/json";
      headers["x-amz-content-sha256"] = createHash("sha256")
        .update(serialized)
        .digest("hex");
    }
    const started = performance.now();
    const response = await fetch(`${baseUrl}${path}`, {
      method: serialized === undefined ? "GET" : "POST",
      headers,
      body: serialized,
      signal: AbortSignal.timeout(15_000),
    });
    const setCookie = response.headers.getSetCookie();
    if (setCookie.length)
      cookie = setCookie.map((value) => value.split(";")[0]).join("; ");
    const payload = await response.json();
    return {
      status: response.status,
      payload,
      ms: performance.now() - started,
      cache: response.headers.get("cache-control"),
      setsCookie: setCookie.length > 0,
    };
  };
}
async function check(name, run) {
  await run();
  checks.push(name);
  console.log(`PASS ${name}`);
}
const owner = client();
const stranger = client();
let replay;
let edition;
const commands = () => `/api/replays/${replay.id}`;
async function act(action) {
  const response = await owner(commands(), {
    id: randomUUID(),
    expectedRevision: replay.revision,
    action,
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(response.cache, "no-store");
  timings.push({ action, ms: Math.round(response.ms) });
  replay = response.payload.replay;
}
function hidden(view) {
  assert.equal(view.actual, null);
  for (const field of [
    "pitchType",
    "result",
    "location",
    "shape",
    "description",
    "postState",
  ])
    assert.equal(field in view.current, false, `Hidden field: ${field}`);
  assert.equal("awayScore" in view.edition.game, false);
  assert.equal("request" in view, false);
  assert.equal(view.history.length, view.index);
}

await check("readiness validates a complete replay without disclosing internals", async () => {
  assert.equal((await owner("/health")).status, 200);
  const ready = await owner("/ready");
  assert.equal(ready.status, 200, JSON.stringify(ready.payload));
  assert.deepEqual(ready.payload, { status: "ok" });
  const featured = await owner("/api/replays");
  edition = featured.payload.edition;
  assert.ok(edition.pitchCount >= 3 && edition.pitchCount <= 8);
  assert.equal(featured.cache, "public, max-age=0, s-maxage=30");
  assert.equal(featured.setsCookie, false);
  assert.deepEqual((await stranger("/api/replays")).payload, featured.payload);
  assert.equal("pitches" in edition, false);
  assert.equal("awayScore" in edition.game, false);
});
await check(
  "start is idempotent and actual pitch facts stay hidden",
  async () => {
    const opened = await owner("/api/replays", { editionId: edition.id });
    assert.equal(opened.status, 200, JSON.stringify(opened.payload));
    assert.equal(opened.cache, "no-store");
    replay = opened.payload.replay;
    hidden(replay);
    assert.equal(replay.step, 0);
    assert.equal((await owner(commands())).cache, "no-store");
    assert.deepEqual(
      (await owner("/api/replays", { editionId: edition.id })).payload.replay,
      replay,
    );
  },
);
await check(
  "ownership, command validation, and origin checks reject invalid work",
  async () => {
    assert.equal((await stranger(commands())).status, 404);
    assert.equal((await owner(commands(), null)).status, 400);
    assert.equal(
      (
        await owner(commands(), {
          id: randomUUID(),
          expectedRevision: 0,
          action: "next",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await owner(
          commands(),
          { id: randomUUID(), expectedRevision: 0, action: "reveal" },
          { origin: "https://other.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await owner(
          commands(),
          { id: randomUUID(), expectedRevision: 0, action: "reveal" },
          { origin: "null" },
        )
      ).status,
      403,
    );
  },
);
await check(
  "lost responses retry exactly once and stale writes conflict",
  async () => {
    const command = {
      id: randomUUID(),
      expectedRevision: replay.revision,
      action: "reveal",
    };
    const once = await owner(commands(), command);
    assert.equal(once.status, 200);
    const twice = await owner(commands(), command);
    assert.deepEqual(twice.payload.replay, once.payload.replay);
    replay = twice.payload.replay;
    assert.equal(replay.step, 1);
    assert.equal(
      (await owner(commands(), { ...command, id: randomUUID() })).status,
      409,
    );
    assert.deepEqual((await owner(commands())).payload.replay, replay);
  },
);
await check("Back and Next preserve the exact saved forecast", async () => {
  await act("next");
  hidden(replay);
  const forecast = replay.prediction;
  const zone = replay.strikeZone;
  await act("back");
  await act("next");
  assert.deepEqual(replay.prediction, forecast);
  assert.deepEqual(replay.strikeZone, zone);
  assert.deepEqual((await owner(commands())).payload.replay, replay);
});
await check("concurrent commands have one authoritative winner", async () => {
  const expectedRevision = replay.revision;
  const responses = await Promise.all(
    ["reveal", "reveal"].map((action) =>
      owner(commands(), { id: randomUUID(), action, expectedRevision }),
    ),
  );
  assert.deepEqual(responses.map((value) => value.status).sort(), [200, 409]);
  replay = (await owner(commands())).payload.replay;
  assert.equal(replay.revision, expectedRevision + 1);
});
await check(
  "every remaining pitch completes without generation or a dead end",
  async () => {
    while (replay.phase !== "complete") {
      await act(replay.phase === "forecast" ? "reveal" : "next");
      if (replay.phase === "forecast") hidden(replay);
    }
    assert.equal(replay.history.length, edition.pitchCount);
    assert.equal(replay.summary.pitches, edition.pitchCount);
    assert.ok(replay.actual);
    await act("restart");
    hidden(replay);
    assert.equal(replay.step, 0);
  },
);
const sorted = timings.map((value) => value.ms).sort((a, b) => a - b);
const report = {
  baseUrl,
  checks: checks.length,
  editionId: edition.id,
  pitches: edition.pitchCount,
  commands: timings,
  latency: {
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1),
  },
};
console.log(JSON.stringify(report, null, 2));
assert.ok(
  report.latency.maxMs < Number(process.env.VERIFY_MAX_COMMAND_MS ?? 2000),
  "Replay commands exceeded the configured latency budget.",
);
