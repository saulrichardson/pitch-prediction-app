import { NextResponse } from "next/server";

export type HttpErrorDetails = Record<string, unknown>;

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: HttpErrorDetails | null;

  constructor(
    status: number,
    message: string,
    code = "http_error",
    details: HttpErrorDetails | null = null,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(body: T): NextResponse<T> {
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(
      403,
      "Open this action from the replay page.",
      "invalid_origin",
    );
  if (origin) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new HttpError(403, "Invalid request origin.", "invalid_origin");
    }
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.host !== host)
      throw new HttpError(
        403,
        "Open this action from the replay page.",
        "invalid_origin",
      );
  }
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function requestError(message: string, code = "bad_request") {
  return new HttpError(400, message, code);
}

export function unauthorized(message: string, code = "unauthorized") {
  return new HttpError(401, message, code);
}

export function notFound(message: string, code = "not_found") {
  return new HttpError(404, message, code);
}

export function conflict(message: string, code = "conflict") {
  return new HttpError(409, message, code);
}

export function tooManyRequests(
  message: string,
  code = "too_many_requests",
  details: HttpErrorDetails | null = null,
) {
  return new HttpError(429, message, code, details);
}

export function gone(message: string, code = "gone") {
  return NextResponse.json({ error: message, code }, { status: 410 });
}

export function serviceUnavailable(
  message: string,
  code = "service_unavailable",
) {
  return new HttpError(503, message, code);
}

export async function readJson(
  request: Request,
  options: { optional?: boolean } = {},
): Promise<unknown> {
  const body = await request.text();
  if (body.length > 4096)
    throw requestError("Request is too large.", "request_too_large");
  if (!body.trim()) {
    if (options.optional) return {};
    throw requestError("Request body must be valid JSON.");
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw requestError("Request body must be valid JSON.");
  }
}

export async function readJsonObject(
  request: Request,
  options: { optional?: boolean } = {},
): Promise<Record<string, unknown>> {
  const value = await readJson(request, options);
  if (!isJsonObject(value)) {
    throw requestError(
      "Request body must be a JSON object.",
      "invalid_json_object",
    );
  }
  return value;
}

export function serverError(error: unknown) {
  if (error instanceof HttpError) {
    if (error.status >= 500) {
      console.error(
        JSON.stringify({
          level: "error",
          code: error.code,
          message: error.message,
          status: error.status,
        }),
      );
    }
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }

  console.error(
    JSON.stringify({ level: "error", error: serializeError(error) }),
  );
  return NextResponse.json(
    { error: "Unexpected server error.", code: "unexpected_server_error" },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}
