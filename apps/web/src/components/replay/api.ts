export class ReplayApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requestJson<T>(
  url: string,
  options: { body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const body =
    options.body === undefined ? undefined : JSON.stringify(options.body);
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(body),
    );
    headers["x-amz-content-sha256"] = Array.from(
      new Uint8Array(digest),
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
  }
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    body,
    headers,
    signal,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ReplayApiError(
      response.status,
      payload?.code ?? "request_failed",
      payload?.error ?? "The replay could not be reached.",
    );
  if (payload === null)
    throw new Error("The replay returned an incomplete response.");
  return payload as T;
}
