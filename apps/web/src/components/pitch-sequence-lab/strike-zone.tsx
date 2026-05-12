import type { StrikeZoneBounds } from "@pitch/domain";

const PITCH_PLOT = {
  pxMin: -2,
  pxMax: 2,
  pzMin: 0.4,
  pzMax: 4.4
};

export function StrikeZoneFrame({ strikeZone }: { strikeZone: StrikeZoneBounds }) {
  const halfWidth = strikeZoneHalfWidthFeet(strikeZone.width);
  const left = plotX(-halfWidth);
  const right = plotX(halfWidth);
  const top = plotY(strikeZone.top);
  const bottom = plotY(strikeZone.bottom);
  return (
    <div
      aria-hidden="true"
      className="strike-zone-frame"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${right - left}%`,
        height: `${bottom - top}%`
      }}
    >
      <span />
      <span />
      <span />
      <span />
      <em>{strikeZoneSourceLabel(strikeZone.source)}</em>
    </div>
  );
}

function strikeZoneHalfWidthFeet(width: number | null): number {
  if (width === null || !Number.isFinite(width) || width <= 0) return 17 / 24;
  const widthFeet = width > 3 ? width / 12 : width;
  return clamp(widthFeet / 2, 0.55, 1.05);
}

export function strikeZoneSourceLabel(source: StrikeZoneBounds["source"]): string {
  if (source === "measured") return "Measured zone";
  if (source === "estimated") return "Estimated zone";
  return "Standard zone";
}

export function ZoneDot({
  location,
  actual,
  label
}: {
  location: { px: number | null; pz: number | null };
  actual?: boolean;
  label?: string;
}) {
  const position = locationPosition(location);
  return (
    <span
      aria-label={label ?? (actual ? "Actual pitch location" : "Expected pitch location")}
      className={`zone-dot ${actual ? "actual-dot" : ""}`}
      role="img"
      style={{ left: `${position.left}%`, top: `${position.top}%` }}
      title={label}
    />
  );
}

export function ZoneMissLine({
  from,
  to
}: {
  from: { px: number | null; pz: number | null };
  to: { px: number | null; pz: number | null };
}) {
  if (from.px === null || from.pz === null || to.px === null || to.pz === null) return null;
  const start = locationPosition(from);
  const end = locationPosition(to);
  return (
    <svg
      aria-hidden="true"
      className="zone-miss-line"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <line
        className="zone-miss-line-shadow"
        x1={start.left}
        y1={start.top}
        x2={end.left}
        y2={end.top}
        vectorEffect="non-scaling-stroke"
      />
      <line
        className="zone-miss-line-path"
        x1={start.left}
        y1={start.top}
        x2={end.left}
        y2={end.top}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function locationPosition(location: { px: number | null; pz: number | null }): { left: number; top: number } {
  return {
    left: location.px === null ? 50 : plotX(location.px),
    top: location.pz === null ? 50 : plotY(location.pz)
  };
}

function plotX(px: number): number {
  const raw = ((px - PITCH_PLOT.pxMin) / (PITCH_PLOT.pxMax - PITCH_PLOT.pxMin)) * 100;
  return clamp(raw, 4, 96);
}

function plotY(pz: number): number {
  const raw = ((PITCH_PLOT.pzMax - pz) / (PITCH_PLOT.pzMax - PITCH_PLOT.pzMin)) * 100;
  return clamp(raw, 4, 96);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
