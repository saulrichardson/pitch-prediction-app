import { describe, expect, it } from "vitest";
import { commandSchema, gameDateSchema } from "../src/browser-contracts";

describe("shared browser and server contracts", () => {
  it("accepts real dates and rejects impossible calendar dates", () => {
    for (const date of ["2024-02-29", "2026-09-12"])
      expect(gameDateSchema.safeParse(date).success).toBe(true);
    for (const date of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "26-09-12",
      "2026-09-12T00:00:00Z",
    ])
      expect(gameDateSchema.safeParse(date).success).toBe(false);
  });
  it("validates saved intent as strictly as an API command", () => {
    const valid = {
      id: crypto.randomUUID(),
      action: "reveal",
      expectedRevision: 0,
    };
    expect(commandSchema.parse(valid)).toEqual(valid);
    for (const invalid of [
      null,
      { ...valid, id: "bad" },
      { ...valid, action: "delete" },
      { ...valid, expectedRevision: -1 },
      { ...valid, expectedRevision: 0.5 },
      { ...valid, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, extra: true },
    ])
      expect(commandSchema.safeParse(invalid).success).toBe(false);
  });
});
