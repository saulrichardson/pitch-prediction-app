import { describe, expect, it } from "vitest";
import { unresolvedCommand } from "./pending-command";

describe("interrupted command recovery", () => {
  const command = {
    id: crypto.randomUUID(),
    action: "reveal",
    expectedRevision: 3,
  };
  const raw = JSON.stringify({ replayId: "one", command });
  it("retains the same command ID when the server has not acknowledged it", () => {
    expect(unresolvedCommand(raw, { id: "one", revision: 3 })?.command).toEqual(
      command,
    );
  });
  it("settles committed commands and discards unrelated or malformed local data", () => {
    for (const value of [
      raw,
      "{bad",
      JSON.stringify({
        replayId: "one",
        command: { ...command, action: "delete" },
      }),
    ])
      expect(unresolvedCommand(value, { id: "one", revision: 4 })).toBeNull();
    expect(unresolvedCommand(raw, { id: "two", revision: 3 })).toBeNull();
  });
});
