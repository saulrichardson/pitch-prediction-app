import { describe, expect, it } from "vitest";
import { shouldRenderVercelTelemetry } from "./site-telemetry-config";

describe("site telemetry runtime gate", () => {
  it("does not render Vercel telemetry outside Vercel by default", () => {
    expect(shouldRenderVercelTelemetry({})).toBe(false);
  });

  it("renders Vercel telemetry on Vercel", () => {
    expect(shouldRenderVercelTelemetry({ VERCEL: "1" })).toBe(true);
    expect(shouldRenderVercelTelemetry({ VERCEL_ENV: "production" })).toBe(true);
  });

  it("can be explicitly enabled or disabled", () => {
    expect(shouldRenderVercelTelemetry({ NEXT_PUBLIC_ENABLE_VERCEL_TELEMETRY: "true" })).toBe(true);
    expect(shouldRenderVercelTelemetry({
      VERCEL: "1",
      NEXT_PUBLIC_ENABLE_VERCEL_TELEMETRY: "false"
    })).toBe(false);
  });
});
