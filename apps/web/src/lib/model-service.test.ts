import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PredictionRequest } from "@pitch/domain";
import { modelHealth, predictPitch } from "./model-service";

const { lambdaSendMock } = vi.hoisted(() => ({
  lambdaSendMock: vi.fn()
}));

vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: vi.fn(function LambdaClient() {
    return {
    send: lambdaSendMock
    };
  }),
  InvokeCommand: vi.fn(function InvokeCommand(input: unknown) {
    return { input };
  })
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  lambdaSendMock.mockReset();
  process.env = { ...originalEnv, MODEL_BASE_URL: "http://model.local", MODEL_API_KEY: "secret" };
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe("model service adapter", () => {
  it("turns model auth failures into explicit service-unavailable errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Invalid model service credentials." }), { status: 401 })));

    await expect(predictPitch(predictionRequest())).rejects.toMatchObject({
      status: 503,
      code: "model_auth_failed",
      message: "Real model prediction failed because model service authentication is not configured correctly."
    });
  });

  it("turns model unavailable responses into explicit service-unavailable errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Model loading." }), { status: 503 })));

    await expect(predictPitch(predictionRequest())).rejects.toMatchObject({
      status: 503,
      code: "model_unavailable",
      message: "Real model prediction is unavailable: Model loading."
    });
  });

  it("rejects malformed model responses with a stable error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "missing-fields" }), { status: 200 })));

    await expect(predictPitch(predictionRequest())).rejects.toMatchObject({
      status: 503,
      code: "model_malformed_response"
    });
  });

  it("turns prediction timeouts into explicit service-unavailable errors", async () => {
    process.env.MODEL_REQUEST_TIMEOUT_MS = "1000";
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw aborted;
    }));

    await expect(predictPitch(predictionRequest())).rejects.toMatchObject({
      status: 503,
      code: "model_timeout",
      message: "Real model prediction timed out after 1 seconds."
    });
  });

  it("checks authenticated readiness through the same bearer-token boundary", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(modelHealth()).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith("http://model.local/ready", expect.objectContaining({
      headers: { authorization: "Bearer secret" }
    }));
  });

  it("reports readiness unavailable when the authenticated check fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Invalid model service credentials." }), { status: 401 })));

    await expect(modelHealth()).resolves.toBe("unavailable");
  });

  it("can call the serverless model Lambda backend", async () => {
    process.env = { ...originalEnv, MODEL_BACKEND: "lambda", MODEL_LAMBDA_FUNCTION_NAME: "pitch-model" };
    lambdaSendMock.mockResolvedValue({
      Payload: Buffer.from(JSON.stringify({ ok: true, prediction: predictionResponse() }))
    });

    await expect(predictPitch(predictionRequest())).resolves.toMatchObject({
      modelVersion: "pitchpredict-xlstm-v0.5.0",
      pitchMix: [{ label: "FF", probability: 0.5 }]
    });

    expect(lambdaSendMock).toHaveBeenCalledTimes(1);
  });

  it("checks serverless model Lambda readiness", async () => {
    process.env = { ...originalEnv, MODEL_BACKEND: "lambda", MODEL_LAMBDA_FUNCTION_NAME: "pitch-model" };
    lambdaSendMock.mockResolvedValue({
      Payload: Buffer.from(JSON.stringify({ ok: true, health: { status: "ok" } }))
    });

    await expect(modelHealth()).resolves.toBe("ok");
  });

  it("rejects malformed serverless model Lambda responses", async () => {
    process.env = { ...originalEnv, MODEL_BACKEND: "lambda", MODEL_LAMBDA_FUNCTION_NAME: "pitch-model" };
    lambdaSendMock.mockResolvedValue({
      Payload: Buffer.from(JSON.stringify({ ok: true, prediction: { id: "missing-fields" } }))
    });

    await expect(predictPitch(predictionRequest())).rejects.toMatchObject({
      status: 503,
      code: "model_malformed_response"
    });
  });

  it("turns serverless model Lambda throttling into a retryable busy error", async () => {
    process.env = { ...originalEnv, MODEL_BACKEND: "lambda", MODEL_LAMBDA_FUNCTION_NAME: "pitch-model" };
    const throttle = new Error("Rate exceeded");
    throttle.name = "TooManyRequestsException";
    Object.assign(throttle, { $metadata: { httpStatusCode: 429 } });
    lambdaSendMock.mockRejectedValue(throttle);

    await expect(predictPitch(predictionRequest())).rejects.toMatchObject({
      status: 503,
      code: "model_busy",
      message: "The real model is handling another prediction. Try again in a moment."
    });
  });
});

function predictionRequest(): PredictionRequest {
  const state = {
    inning: 1,
    half: "top" as const,
    count: { balls: 0 as const, strikes: 0 as const },
    outs: 0 as const,
    bases: { first: false, second: false, third: false },
    awayScore: 0,
    homeScore: 0
  };
  return {
    pitcherId: "10",
    batterId: "20",
    pitcherHand: "R",
    batterSide: "L",
    gameDate: "2026-05-10",
    count: state.count,
    outs: 0,
    bases: state.bases,
    score: { away: 0, home: 0 },
    inning: 1,
    half: "top",
    pitchNumber: 1,
    timesThroughOrder: 1,
    strikeZone: { top: 3.5, bottom: 1.5 },
    pitcherSessionHistory: [],
    currentPaHistory: []
  };
}

function predictionResponse() {
  return {
    id: "pred-1",
    modelVersion: "pitchpredict-xlstm-v0.5.0",
    pitchMix: [{ label: "FF", probability: 0.5 }],
    resultMix: [{ label: "Strike/Foul", probability: 0.5 }],
    location: {
      density: [{ label: "Middle", probability: 0.5 }],
      expected: { px: 0, pz: 2.5, zone: 5, label: "Middle" }
    },
    countImpact: [{ label: "0-1", probability: 0.5 }],
    paForecast: [{ label: "Ball in play", probability: 0.5 }],
    expectedPitchesRemaining: 3.2,
    possiblePitches: [{
      pitchType: "FF",
      velocity: 94,
      location: { px: 0, pz: 2.5, zone: 5, label: "Middle" },
      result: "called_strike",
      description: "FF 94 middle, called strike"
    }],
    createdAt: "2026-05-10T00:00:00.000Z"
  };
}
