// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  matchupIdentity,
  playerInitials,
  playerPortraitUrl,
  teamById,
} from "./mlb-identity";

describe("MLB matchup identity", () => {
  it("loads every bundled logo as a standalone SVG image", () => {
    const directory = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../assets/mlb/teams",
    );
    const files = readdirSync(directory, {
      recursive: true,
      encoding: "utf8",
    }).filter((file) => file.endsWith(".svg"));
    expect(files.length).toBeGreaterThanOrEqual(30);
    for (const file of files) {
      const svg = new DOMParser().parseFromString(
        readFileSync(path.join(directory, file), "utf8"),
        "image/svg+xml",
      ).documentElement;
      expect(svg.localName, file).toBe("svg");
      expect(svg.namespaceURI, file).toBe("http://www.w3.org/2000/svg");
      const box = svg.getAttribute("viewBox")!.split(/\s+/).map(Number);
      expect(box.length, file).toBe(4);
      expect(box.every(Number.isFinite), file).toBe(true);
      expect(box[2], file).toBeGreaterThan(0);
      expect(box[3], file).toBeGreaterThan(0);
    }
  });

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
