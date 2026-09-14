import { describe, expect, it } from "vitest";
import { pseudonymizeViewerIp } from "./viewer-identity";

const secret = "a-production-length-secret-for-tests";

describe("viewer identity", () => {
  it("creates stable, domain-separated pseudonyms without retaining the IP", () => {
    const first = pseudonymizeViewerIp("192.0.2.10", secret);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(pseudonymizeViewerIp("192.0.2.10", secret));
    expect(first).not.toBe(pseudonymizeViewerIp("192.0.2.11", secret));
    expect(first).not.toContain("192.0.2.10");
  });

  it("accepts IPv6 and rejects untrusted address shapes", () => {
    expect(pseudonymizeViewerIp("2001:db8::1", secret)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(() => pseudonymizeViewerIp("forwarded.example", secret)).toThrow(
      "invalid",
    );
  });
});
