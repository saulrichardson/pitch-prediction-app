import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../../db/src/storage/memory";
import {
  callerPreparationLimits,
  reserveCallerPreparation,
} from "./caller-budget";

const caller = "a".repeat(64);
const timestamp = new Date("2026-09-12T18:00:00Z");

describe("caller preparation budget", () => {
  it("counts distinct games and makes retries idempotent", async () => {
    const storage = new MemoryStorage();
    await expect(
      reserveCallerPreparation(storage, caller, "42", timestamp),
    ).resolves.toEqual({ allowed: true, alreadyReserved: false });
    await expect(
      reserveCallerPreparation(storage, caller, "42", timestamp),
    ).resolves.toEqual({ allowed: true, alreadyReserved: true });
  });

  it("atomically enforces the daily limit under concurrency", async () => {
    const storage = new MemoryStorage();
    const decisions = await Promise.all(
      Array.from({ length: callerPreparationLimits.dailyGames + 3 }, (_, i) =>
        reserveCallerPreparation(storage, caller, String(100 + i), timestamp),
      ),
    );
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(
      callerPreparationLimits.dailyGames,
    );
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(3);
    expect(decisions.find((decision) => !decision.allowed)).toEqual({
      allowed: false,
      retryAt: "2026-09-13T00:00:00.000Z",
    });
  });

  it("enforces the monthly limit across days", async () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < callerPreparationLimits.monthlyGames; i++) {
      const day = new Date(
        Date.UTC(
          2026,
          8,
          1 + Math.floor(i / callerPreparationLimits.dailyGames),
        ),
      );
      expect(
        (await reserveCallerPreparation(storage, caller, String(i), day))
          .allowed,
      ).toBe(true);
    }
    await expect(
      reserveCallerPreparation(
        storage,
        caller,
        "next",
        new Date("2026-09-12T18:00:00Z"),
      ),
    ).resolves.toEqual({
      allowed: false,
      retryAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("rejects unhashed caller identifiers", async () => {
    await expect(
      reserveCallerPreparation(
        new MemoryStorage(),
        "192.0.2.1",
        "42",
        timestamp,
      ),
    ).rejects.toThrow("SHA-256 digest");
  });
});
