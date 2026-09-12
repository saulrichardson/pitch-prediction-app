export function shouldRenderVercelTelemetry(env: Record<string, string | undefined> = process.env) {
  const explicit = env.NEXT_PUBLIC_ENABLE_VERCEL_TELEMETRY?.trim().toLowerCase();
  if (explicit) return ["1", "true", "yes", "on"].includes(explicit);
  return env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
}
