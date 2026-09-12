import { describe, expect, it } from "vitest";
import { sameJsonValue } from "../src/json-equality";

describe("stored JSON values", () => {
  it("compares nested maps independently of property order", () => {
    expect(
      sameJsonValue(
        { history: [{ release: { x: 1, z: null }, pitch: "FF" }], count: 0 },
        { count: 0, history: [{ pitch: "FF", release: { z: null, x: 1 } }] },
      ),
    ).toBe(true);
  });
  it("preserves sequence, value, and missing-field distinctions", () => {
    for (const [left, right] of [
      [
        [1, 2],
        [2, 1],
      ],
      [{ balls: 0 }, { balls: 1 }],
      [{ velocity: null }, {}],
      [[], {}],
      [null, 0],
      [[1], [1, 2]],
    ])
      expect(sameJsonValue(left, right)).toBe(false);
  });
});
