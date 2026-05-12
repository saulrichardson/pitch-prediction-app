import {
  predictionResponseSchema,
  type PredictionRequest,
  type PredictionResponse
} from "@pitch/domain";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { appSecretConfig } from "./env";
import { serviceUnavailable } from "./http";

export type ModelHealthStatus = "ok" | "loading" | "unavailable";

type ModelBackend = "http" | "lambda";

const lambdaClient = new LambdaClient({});

export async function predictPitch(request: PredictionRequest): Promise<PredictionResponse> {
  if (modelBackend() === "lambda") {
    return predictPitchWithLambda(request);
  }

  return predictPitchWithHttp(request);
}

async function predictPitchWithHttp(request: PredictionRequest): Promise<PredictionResponse> {
  const config = appSecretConfig();
  const baseUrl = config.modelBaseUrl;
  if (!baseUrl) throw serviceUnavailable("Real model prediction is unavailable because MODEL_BASE_URL is not configured.", "model_not_configured");
  const controller = new AbortController();
  const timeoutMs = modelRequestTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/pitch/predict`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...authorizationHeader(config.modelApiKey)
      },
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      throw modelHttpError(response.status, await responseErrorMessage(response));
    }
    const payload = await response.json().catch(() => {
      throw serviceUnavailable("Real model prediction returned malformed JSON.", "model_malformed_response");
    });
    const parsed = predictionResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw serviceUnavailable("Real model prediction response did not match the product contract.", "model_malformed_response");
    }
    return parsed.data as PredictionResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw serviceUnavailable(`Real model prediction timed out after ${Math.round(timeoutMs / 1000)} seconds.`, "model_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function modelHealth(): Promise<ModelHealthStatus> {
  if (modelBackend() === "lambda") {
    return modelHealthWithLambda();
  }

  const config = appSecretConfig();
  const baseUrl = config.modelBaseUrl;
  if (!baseUrl) return "unavailable";
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/ready`, {
      headers: authorizationHeader(config.modelApiKey),
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) return "unavailable";
    const body = await response.json().catch(() => null) as { status?: string } | null;
    if (body?.status === "ok") return "ok";
    if (body?.status === "loading") return "loading";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

async function predictPitchWithLambda(request: PredictionRequest): Promise<PredictionResponse> {
  const payload = await invokeModelLambda({ action: "predict", request });
  if (!isModelLambdaOk(payload)) {
    throw modelLambdaError(payload);
  }

  const parsed = predictionResponseSchema.safeParse(payload.prediction);
  if (!parsed.success) {
    throw serviceUnavailable("Real model prediction response did not match the product contract.", "model_malformed_response");
  }
  return parsed.data as PredictionResponse;
}

async function modelHealthWithLambda(): Promise<ModelHealthStatus> {
  try {
    const payload = await invokeModelLambda({ action: "health" }, 3000);
    if (!isModelLambdaOk(payload)) return "unavailable";
    const health = isRecord(payload.health) ? payload.health : null;
    const status = health?.status;
    if (status === "ok") return "ok";
    if (status === "loading") return "loading";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

async function invokeModelLambda(payload: unknown, timeoutMs = modelRequestTimeoutMs()): Promise<Record<string, unknown>> {
  const config = appSecretConfig();
  const functionName = config.modelLambdaFunctionName;
  if (!functionName) {
    throw serviceUnavailable("Real model prediction is unavailable because MODEL_LAMBDA_FUNCTION_NAME is not configured.", "model_not_configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await lambdaClient.send(new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload))
    }), { abortSignal: controller.signal });

    const text = response.Payload ? new TextDecoder().decode(response.Payload) : "";
    const parsed = text ? JSON.parse(text) as unknown : null;
    if (!isRecord(parsed)) {
      throw serviceUnavailable("Real model prediction returned malformed JSON.", "model_malformed_response");
    }
    if (response.FunctionError) {
      throw serviceUnavailable(`Real model prediction is unavailable: ${lambdaErrorMessage(parsed)}`, "model_unavailable");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw serviceUnavailable(`Real model prediction timed out after ${Math.round(timeoutMs / 1000)} seconds.`, "model_timeout");
    }
    if (error instanceof SyntaxError) {
      throw serviceUnavailable("Real model prediction returned malformed JSON.", "model_malformed_response");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function modelBackend(): ModelBackend {
  const config = appSecretConfig();
  const backend = config.modelBackend ?? (config.modelLambdaFunctionName ? "lambda" : "http");
  if (backend === "lambda" || backend === "http") return backend;
  throw serviceUnavailable(`MODEL_BACKEND must be either "http" or "lambda". Received "${backend}".`, "model_backend_misconfigured");
}

function modelRequestTimeoutMs(): number {
  const raw = process.env.MODEL_REQUEST_TIMEOUT_MS ?? "60000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("MODEL_REQUEST_TIMEOUT_MS must be a positive number of milliseconds.");
  }
  return Math.min(Math.round(parsed), 5 * 60 * 1000);
}

function authorizationHeader(modelApiKey: string | undefined): Record<string, string> {
  return modelApiKey ? { authorization: `Bearer ${modelApiKey}` } : {};
}

async function responseErrorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | { detail?: string } | null;
  if (body && "error" in body && body.error) return body.error;
  if (body && "detail" in body && body.detail) return body.detail;
  return `Model service returned ${response.status}.`;
}

function modelHttpError(status: number, detail: string) {
  if (status === 401 || status === 403) {
    return serviceUnavailable("Real model prediction failed because model service authentication is not configured correctly.", "model_auth_failed");
  }
  if (status === 408 || status === 429 || status >= 500) {
    return serviceUnavailable(`Real model prediction is unavailable: ${detail}`, "model_unavailable");
  }
  return serviceUnavailable(`Real model prediction failed: ${detail}`, "model_unavailable");
}

function modelLambdaError(payload: Record<string, unknown>) {
  const code = typeof payload.code === "string" ? payload.code : "model_unavailable";
  const message = typeof payload.error === "string" ? payload.error : "Model Lambda returned an unavailable response.";
  if (code === "invalid_prediction_request") {
    return serviceUnavailable(`Real model prediction request was rejected by the model boundary: ${message}`, "model_malformed_request");
  }
  return serviceUnavailable(`Real model prediction is unavailable: ${message}`, code);
}

function isModelLambdaOk(payload: Record<string, unknown>): payload is Record<string, unknown> & { ok: true } {
  return payload.ok === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function lambdaErrorMessage(payload: Record<string, unknown>) {
  if (typeof payload.errorMessage === "string") return payload.errorMessage;
  if (typeof payload.error === "string") return payload.error;
  return "Lambda invocation failed.";
}
