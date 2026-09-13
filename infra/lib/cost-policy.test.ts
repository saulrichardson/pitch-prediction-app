import { describe, expect, it, vi } from "vitest";
import {
  costPolicy,
  enforceCostLimit,
  parseCostState,
  validateSpend,
  type CostState,
  type CostControlPorts,
} from "./cost-policy";

function fixture(spend = 50, initial: CostState = { status: "armed" }) {
  let state = initial;
  const ports: CostControlPorts = {
    readState: vi.fn(async () => state),
    readActualSpend: vi.fn(async () => spend),
    saveState: vi.fn(async (next) => {
      state = next;
    }),
    stopFunction: vi.fn(async () => {}),
    stopPublicTraffic: vi.fn(async () => {}),
    notifyShutdown: vi.fn(async () => {}),
    now: () => "2026-09-13T12:00:00.000Z",
  };
  return ports;
}

describe("monthly cost shutdown", () => {
  it("does no writes or shutdown below the limit", async () => {
    const ports = fixture(49.999);
    expect(await enforceCostLimit(ports)).toMatchObject({ shouldStop: false });
    expect(ports.saveState).not.toHaveBeenCalled();
    expect(ports.stopFunction).not.toHaveBeenCalled();
    expect(ports.notifyShutdown).not.toHaveBeenCalled();
  });
  it("latches at exactly $50 before stopping only the app's functions and traffic", async () => {
    const ports = fixture();
    await enforceCostLimit(ports);
    expect(
      vi.mocked(ports.stopFunction).mock.calls.map(([name]) => name),
    ).toEqual(costPolicy.applicationFunctions);
    expect(ports.stopPublicTraffic).toHaveBeenCalledOnce();
    expect(vi.mocked(ports.saveState).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ports.stopFunction).mock.invocationCallOrder[0],
    );
    expect(await ports.readState()).toMatchObject({
      status: "tripped",
      actualUsd: 50,
      notifiedAt: ports.now(),
    });
  });
  it("attempts other stops after a partial failure and retries without losing the latch", async () => {
    const ports = fixture(51);
    vi.mocked(ports.stopFunction).mockRejectedValueOnce(
      new Error("AWS unavailable"),
    );
    await expect(enforceCostLimit(ports)).rejects.toThrow("incomplete");
    expect(ports.stopFunction).toHaveBeenCalledTimes(3);
    expect(ports.stopPublicTraffic).toHaveBeenCalledOnce();
    expect(ports.notifyShutdown).not.toHaveBeenCalled();
    expect(await ports.readState()).toMatchObject({ status: "tripped" });
    await enforceCostLimit(ports);
    expect(ports.notifyShutdown).toHaveBeenCalledOnce();
  });
  it("keeps enforcing across month rollover and billing outages without repeated success alerts", async () => {
    const ports = fixture(0, {
      status: "tripped",
      actualUsd: 52,
      trippedAt: "2026-08-31T12:00:00Z",
      notifiedAt: "2026-08-31T12:01:00Z",
    });
    vi.mocked(ports.readActualSpend).mockRejectedValue(
      new Error("billing unavailable"),
    );
    await enforceCostLimit(ports);
    expect(ports.readActualSpend).not.toHaveBeenCalled();
    expect(ports.stopFunction).toHaveBeenCalledTimes(3);
    expect(ports.notifyShutdown).not.toHaveBeenCalled();
  });
  it("does not stop anything when it cannot persist the latch", async () => {
    const ports = fixture();
    vi.mocked(ports.saveState).mockRejectedValue(
      new Error("state unavailable"),
    );
    await expect(enforceCostLimit(ports)).rejects.toThrow("state unavailable");
    expect(ports.stopFunction).not.toHaveBeenCalled();
  });
  it("retries a failed completion notification", async () => {
    const ports = fixture();
    vi.mocked(ports.notifyShutdown).mockRejectedValueOnce(
      new Error("SNS unavailable"),
    );
    await expect(enforceCostLimit(ports)).rejects.toThrow("SNS unavailable");
    expect(await ports.readState()).not.toHaveProperty("notifiedAt");
    await enforceCostLimit(ports);
    expect(await ports.readState()).toHaveProperty("notifiedAt");
  });
  it("allows a read-only live check even above the threshold", async () => {
    const ports = fixture(60);
    expect(await enforceCostLimit(ports, true)).toMatchObject({
      dryRun: true,
      shouldStop: true,
    });
    expect(ports.saveState).not.toHaveBeenCalled();
    expect(ports.stopFunction).not.toHaveBeenCalled();
    expect(ports.stopPublicTraffic).not.toHaveBeenCalled();
    expect(ports.notifyShutdown).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -1])(
    "rejects invalid spend %s without changing resources",
    async (spend) => {
      const ports = fixture(spend);
      await expect(enforceCostLimit(ports)).rejects.toThrow(
        "Invalid actual spend",
      );
      expect(ports.saveState).not.toHaveBeenCalled();
    },
  );
  it("validates actual USD amounts and retained states", () => {
    expect(validateSpend("1.406", "USD")).toBe(1.406);
    for (const amount of [undefined, "", " ", "NaN", "-1", "Infinity"])
      expect(() => validateSpend(amount, "USD")).toThrow();
    expect(() => validateSpend("50", "EUR")).toThrow();
    expect(parseCostState('{"status":"armed"}')).toEqual({ status: "armed" });
    for (const raw of [
      "null",
      "{}",
      '{"status":"tripped"}',
      '{"status":"tripped","actualUsd":50,"trippedAt":"invalid"}',
    ])
      expect(() => parseCostState(raw)).toThrow();
  });
});
