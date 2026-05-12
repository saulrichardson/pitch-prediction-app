#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL ?? process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

const results = [];

function assert(condition, message, details) {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
}

function createClient() {
  const cookies = new Map();
  return {
    async request(path, options = {}) {
      const headers = new Headers(options.headers ?? {});
      if (options.body !== undefined) headers.set("content-type", "application/json");
      if (cookies.size > 0) {
        headers.set("cookie", Array.from(cookies.entries()).map(([key, value]) => `${key}=${value}`).join("; "));
      }
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      const setCookies = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);
      for (const setCookie of setCookies) {
        const [pair] = setCookie.split(";");
        const [key, value] = pair.split("=");
        if (key && value !== undefined) cookies.set(key, value);
      }
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      return { response, payload };
    },
    cookieHeader() {
      return Array.from(cookies.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
    }
  };
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const summary = await fn();
    results.push({ name, status: "pass", ms: Date.now() - started, summary });
    console.log(`PASS ${name}${summary ? ` - ${summary}` : ""}`);
  } catch (error) {
    results.push({ name, status: "fail", ms: Date.now() - started, summary: error.message });
    console.error(`FAIL ${name}\n${error.stack}`);
    process.exitCode = 1;
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const anon = createClient();
const client = createClient();
let latestGame;
let replay;
let timeline;
let workspaceId;

await step("public health and readiness endpoints respond", async () => {
  let health;
  let ready;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    health = await anon.request("/health");
    ready = await anon.request("/ready");
    if (health.response.ok && ready.response.ok) break;
    await sleep(5000);
  }
  assert(health.response.ok, "/health should be public and healthy", health.payload);
  assert(ready.response.ok, "/ready should be healthy", ready.payload);
  assert(ready.payload.status === "ok", "/ready should report status ok", ready.payload);
  assert(["memory", "dynamodb", "postgres"].includes(ready.payload.storageMode), "/ready should report explicit storage mode", ready.payload);
  assert(["ok", "unavailable"].includes(ready.payload.model), "/ready should report real model status", ready.payload);
  assert(ready.payload.model === "ok", "product-flow verification requires the real model to be ready", ready.payload);
  return `model=${ready.payload.model}, storage=${ready.payload.storageMode}`;
});

await step("anonymous workspace session is issued automatically", async () => {
  const session = await client.request("/api/auth/session");
  assert(session.response.ok, "session endpoint should respond", session.payload);
  assert(session.payload.session?.workspaceId, "session endpoint should return workspace session", session.payload);
  assert(session.payload.session?.anonymous === true, "session should be anonymous", session.payload);
  workspaceId = session.payload.session.workspaceId;
  return `workspace=${workspaceId}`;
});

await step("latest Mets game and replay can be loaded", async () => {
  const latest = await client.request("/api/games/mets/latest");
  assert(latest.response.ok, "latest Mets game should load", latest.payload);
  latestGame = latest.payload.game;
  assert(latestGame?.gamePk, "latest response should include gamePk", latest.payload);
  assert(latestGame?.label, "latest response should include game label", latest.payload);

  const replayResponse = await client.request(`/api/games/${latestGame.gamePk}/replay`);
  assert(replayResponse.response.ok, "replay should load", replayResponse.payload);
  replay = replayResponse.payload.replay;
  assert(replay.game.gamePk === latestGame.gamePk, "replay should match latest game", replay);
  assert(typeof replay.pitchCount === "number" && replay.pitchCount > 20, "replay should expose a pitch count", { count: replay.pitchCount });
  assert(!("pitches" in replay), "replay API should not expose actual pitch events before reveal", replay);
  return `${latestGame.label}, pitches=${replay.pitchCount}`;
});

await step("actual timeline starts before reveal with prediction visible", async () => {
  const created = await client.request("/api/timelines", { method: "POST", body: { gamePk: latestGame.gamePk } });
  assert(created.response.ok, "timeline should be created from replay", created.payload);
  timeline = created.payload.timeline;
  assert(timeline.mode === "real-game", "timeline should be real-game mode", timeline);
  assert(timeline.currentPitchIndex === 0, "timeline should start on first pitch", timeline);
  assert(timeline.actualRevealed === false, "actual pitch should start hidden", timeline);
  assert(timeline.actualHistory.length === 0, "actual history should start empty", timeline);
  assert(!("actualPitches" in timeline), "client timeline should not expose full actual pitch list", timeline);
  assert(timeline.currentPitch?.matchup?.pitcherName && timeline.currentPitch?.matchup?.batterName, "current pitch context should include matchup names", timeline.currentPitch);
  assert(timeline.currentPitch.preState.count.balls === 0 && timeline.currentPitch.preState.count.strikes === 0, "first pitch should start 0-0", timeline.currentPitch.preState);
  assert(!("pitchType" in timeline.currentPitch), "current pitch context should not expose hidden pitch type", timeline.currentPitch);
  assert(!("result" in timeline.currentPitch), "current pitch context should not expose hidden pitch result", timeline.currentPitch);
  assert(!("location" in timeline.currentPitch), "current pitch context should not expose hidden pitch location", timeline.currentPitch);
  assert(!("shape" in timeline.currentPitch), "current pitch context should not expose hidden pitch shape", timeline.currentPitch);
  assert(timeline.nextPitchContext === null, "next pitch context should not be exposed before current reveal", timeline);
  assert(timeline.actualPrediction?.pitchMix?.length > 0, "prediction should be populated before reveal", timeline.actualPrediction);
  assert(timeline.actualPrediction?.resultMix?.length > 0, "result prediction should be populated before reveal", timeline.actualPrediction);
  assert(timeline.actualPrediction?.location?.expected?.label, "location prediction should be populated before reveal", timeline.actualPrediction);
  assert(!String(timeline.actualPrediction.modelVersion ?? "").toLowerCase().includes("mock"), "prediction must not come from a mock model", timeline.actualPrediction);
  return `top=${timeline.actualPrediction.pitchMix[0].label}`;
});

await step("invalid advance before reveal is rejected", async () => {
  const response = await client.request(`/api/timelines/${timeline.id}/advance`, { method: "POST", body: {} });
  assert(!response.response.ok, "advance before reveal should not be allowed", response.payload);
  assert(String(response.payload.error ?? "").includes("Reveal"), "error should explain reveal requirement", response.payload);
});

await step("optional JSON routes reject null bodies without 500s", async () => {
  const advanceNull = await client.request(`/api/timelines/${timeline.id}/advance`, { method: "POST", body: null });
  assert(advanceNull.response.status === 400, "advance null body should be a 400", advanceNull.payload);
  assert(advanceNull.payload.code === "invalid_json_object", "advance null body should use a stable error code", advanceNull.payload);

  const generateNull = await client.request(`/api/timelines/${timeline.id}/generate`, { method: "POST", body: null });
  assert(generateNull.response.status === 400, "generate null body should be a 400", generateNull.payload);
  assert(generateNull.payload.code === "invalid_json_object", "generate null body should use a stable error code", generateNull.payload);
});

await step("reveal actual scores the pitch against the stored prediction", async () => {
  const reveal = await client.request(`/api/timelines/${timeline.id}/reveal`, { method: "POST", body: {} });
  assert(reveal.response.ok, "reveal should succeed", reveal.payload);
  timeline = reveal.payload.timeline;
  const pitch = reveal.payload.pitch;
  const evaluation = reveal.payload.evaluation;
  assert(timeline.actualRevealed === true, "timeline should mark actual as revealed", timeline);
  assert(pitch.source === "actual", "revealed pitch should be actual", pitch);
  assert(timeline.nextPitchContext === null || !("pitchType" in timeline.nextPitchContext), "next pitch context should stay redacted after reveal", timeline.nextPitchContext);
  assert(typeof evaluation.pitchTypeProbability === "number", "evaluation should include pitch probability", evaluation);
  assert(typeof evaluation.resultProbability === "number", "evaluation should include result probability", evaluation);
  assert(["Expected", "Plausible", "Surprising", "Very Surprising"].includes(evaluation.label), "evaluation should include expectedness label", evaluation);
  return `${pitch.pitchType} ${pitch.result}, ${evaluation.label}`;
});

await step("next pitch advances actual history and recomputes prediction", async () => {
  const advanced = await client.request(`/api/timelines/${timeline.id}/advance`, { method: "POST", body: {} });
  assert(advanced.response.ok, "advance after reveal should succeed", advanced.payload);
  timeline = advanced.payload.timeline;
  assert(timeline.currentPitchIndex === 1, "timeline should advance to pitch two", timeline);
  assert(timeline.actualHistory.length === 1, "actual history should include revealed previous pitch", timeline);
  assert(timeline.actualRevealed === false, "next actual pitch should be hidden", timeline);
  assert(timeline.activeBranchId === null, "actual advance should keep user on trunk", timeline);
  assert(timeline.actualPrediction?.id, "next prediction should be present", timeline.actualPrediction);
  return `pitchIndex=${timeline.currentPitchIndex}`;
});

await step("manual situation uses the same next-pitch prediction path", async () => {
  const manual = await client.request("/api/manual-situations", {
    method: "POST",
    body: {
      pitcherName: "Kodai Senga",
      batterName: "Ketel Marte",
      balls: 3,
      strikes: 2,
      outs: 1,
      inning: 7,
      awayScore: 2,
      homeScore: 1,
      firstBase: true,
      secondBase: false,
      thirdBase: false
    }
  });
  assert(manual.response.ok, "manual situation should be created", manual.payload);
  const manualTimeline = manual.payload.timeline;
  assert(manualTimeline.mode === "manual", "manual timeline should be manual mode", manualTimeline);
  assert(manualTimeline.manualSituation.state.count.balls === 3, "manual count should be preserved", manualTimeline.manualSituation);
  assert(manualTimeline.actualPrediction.pitchMix.length > 0, "manual situation should have prediction", manualTimeline.actualPrediction);
  assert(manualTimeline.actualPrediction.location.expected.label, "manual situation should include likely location", manualTimeline.actualPrediction);
  assert(manualTimeline.activeBranchId === null, "manual prediction should not activate a scenario branch", manualTimeline);
  return `manual=${manualTimeline.manualSituation.matchup.pitcherName} vs ${manualTimeline.manualSituation.matchup.batterName}`;
});

await step("timeline access is scoped to the anonymous workspace", async () => {
  const other = createClient();
  const otherSession = await other.request("/api/auth/session");
  assert(otherSession.response.ok, "second workspace session should be issued", otherSession.payload);
  assert(otherSession.payload.session?.workspaceId && otherSession.payload.session.workspaceId !== workspaceId, "second client should get a distinct workspace", otherSession.payload);
  const forbidden = await other.request(`/api/timelines/${timeline.id}/reveal`, { method: "POST", body: {} });
  assert(!forbidden.response.ok, "second workspace should not operate on first workspace timeline", forbidden.payload);
  assert(String(forbidden.payload.error ?? "").includes("Timeline not found"), "workspace-scoped miss should be explicit", forbidden.payload);
});

console.log("\nProduct-flow verification complete.");
console.log(JSON.stringify({
  baseUrl,
  passed: results.filter((result) => result.status === "pass").length,
  failed: results.filter((result) => result.status === "fail").length,
  checks: results
}, null, 2));
