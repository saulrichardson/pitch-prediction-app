import { expect, it } from "vitest";
import { plotPosition, plotX, plotY } from "./plot-position";

it("uses equal physical units and distinguishes off-plot locations from missing tracking", () => {
  expect(plotX(1) - plotX(0)).toBe(plotY(0) - plotY(1));
  expect(
    plotPosition({ px: 0, pz: 2.5, zone: 5, label: "Middle" }),
  ).toMatchObject({ x: 160, y: 120, outside: false });
  expect(
    plotPosition({ px: 5, pz: 5, zone: null, label: "High right" }),
  ).toMatchObject({ x: 308, y: 12, outside: true });
  expect(
    plotPosition({ px: null, pz: 2.5, zone: null, label: "Untracked" }),
  ).toBeNull();
});
