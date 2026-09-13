"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import {
  playerInitials,
  playerPortraitUrl,
  type TeamIdentity,
} from "./mlb-identity";
import { teamMarks } from "./team-marks";

export function teamStyle(team: TeamIdentity | null): CSSProperties {
  return {
    "--team-color": team?.color ?? "var(--color-muted)",
  } as CSSProperties;
}

/** Adjacent text always names the team; the mark is decorative. */
export function TeamMark({ team }: { team: TeamIdentity | null }) {
  const mark = team ? teamMarks[team.id] : null;
  const [failedMark, setFailedMark] = useState<string | null>(null);
  if (!mark) return null;
  if (failedMark === mark.light) {
    return (
      <span className="team-mark team-mark-fallback" aria-hidden="true">
        {team?.abbreviation}
      </span>
    );
  }
  return (
    <picture className="team-mark">
      <source media="(prefers-color-scheme: dark)" srcSet={mark.dark} />
      <Image
        src={mark.light}
        alt=""
        width={40}
        height={40}
        unoptimized
        onError={() => setFailedMark(mark.light)}
      />
    </picture>
  );
}

export function PlayerPortrait({
  id,
  name,
  team,
  featured = false,
}: {
  id: string;
  name: string;
  team: TeamIdentity | null;
  featured?: boolean;
}) {
  const src = playerPortraitUrl(id);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <span
      className={`player-portrait${featured ? " player-portrait-featured" : ""}`}
      style={teamStyle(team)}
      aria-hidden="true"
    >
      {src && failedSource !== src ? (
        <Image
          src={src}
          alt=""
          width={320}
          height={320}
          unoptimized
          loading={featured ? "eager" : "lazy"}
          onError={() => setFailedSource(src)}
        />
      ) : (
        <span className="portrait-initials">{playerInitials(name)}</span>
      )}
    </span>
  );
}
