import { describe, expect, it } from "vitest";
import {
  matchupIdentity,
  playerInitials,
  playerPortraitUrl,
  teamById,
} from "./mlb-identity";

describe("MLB matchup identity", () => {
  it("assigns the home pitcher and away batter in the top half", () => {
    const identity = matchupIdentity("NYM @ NYY", "top");
    expect(identity.pitcher.team?.name).toBe("New York Yankees");
    expect(identity.batter.team?.name).toBe("New York Mets");
    expect(identity.away.team?.id).toBe(121);
    expect(identity.home.team?.id).toBe(147);
  });

  it("reverses player affiliations, preserving team order, in the bottom half", () => {
    const identity = matchupIdentity("PIT @ CHC", "bottom");
    expect(identity.pitcher.team?.id).toBe(134);
    expect(identity.batter.team?.id).toBe(112);
    expect(identity.away.code).toBe("PIT");
    expect(identity.home.code).toBe("CHC");
  });

  it("keeps unknown teams unbranded instead of assigning an unrelated logo", () => {
    expect(teamById(99999)).toBeNull();
    const identity = matchupIdentity("VIS @ HOME", "top");
    expect(identity.away).toEqual({ code: "VIS", team: null });
    expect(identity.home).toEqual({ code: "HOME", team: null });
  });

  it("requests portraits only for valid MLB player identifiers", () => {
    expect(new URL(playerPortraitUrl("596019")!).pathname).toContain(
      "/people/596019/headshot/silo/current",
    );
    for (const invalid of [
      "",
      "0",
      "-1",
      "unknown",
      "../596019",
      "596019?team=147",
    ])
      expect(playerPortraitUrl(invalid)).toBeNull();
    expect(playerInitials("  José  Ramírez ")).toBe("JR");
    expect(playerInitials("Ichiro")).toBe("I");
  });
});
