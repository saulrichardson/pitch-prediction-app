import type { PitchLocation } from "@pitch/domain";

export const plotX = (feet: number) => 160 + feet * 80;
export const plotY = (feet: number) => 320 - feet * 80;

export function plotPosition(location: PitchLocation | null) {
  if (location?.px == null || location.pz == null) return null;
  const originalX = plotX(location.px),
    originalY = plotY(location.pz);
  const x = Math.max(12, Math.min(308, originalX));
  const y = Math.max(12, Math.min(284, originalY));
  return {
    x,
    y,
    outside: x !== originalX || y !== originalY,
    angle: (Math.atan2(originalY - y, originalX - x) * 180) / Math.PI + 90,
  };
}
