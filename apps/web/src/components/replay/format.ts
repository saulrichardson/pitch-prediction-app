import type { PitchType, Probability } from "@pitch/domain";
export const pitchNames: Record<PitchType, string> = {
  FF: "Four-seam",
  SI: "Sinker",
  SL: "Slider",
  CH: "Changeup",
  CU: "Curveball",
  FC: "Cutter",
  FS: "Splitter",
  Other: "Other",
};
export function pitchName(value: string) {
  return pitchNames[value as PitchType] ?? value;
}
export function percent(value: number) {
  return value > 0 && value < 0.01 ? "<1%" : `${Math.round(value * 100)}%`;
}
export function ranked(items: Probability[]) {
  return [...items].sort((a, b) => b.probability - a.probability);
}
export function gameDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
