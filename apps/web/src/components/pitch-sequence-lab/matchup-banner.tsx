import Image from "next/image";
import type { PitchMoment } from "@pitch/domain";
import { batSideText, handLabel, mlbHeadshotUrl, playerInitials } from "./formatters";

export function MatchupBanner({ pitch }: { pitch: PitchMoment }) {
  return (
    <section className="matchup-banner" data-testid="top-matchup" aria-label={`${pitch.matchup.pitcherName} versus ${pitch.matchup.batterName}`}>
      <PlayerCard
        id={pitch.matchup.pitcherId}
        name={pitch.matchup.pitcherName}
        meta={handLabel(pitch.matchup.pitcherHand)}
        role="Pitcher"
      />
      <span className="matchup-vs">vs</span>
      <PlayerCard
        id={pitch.matchup.batterId}
        name={pitch.matchup.batterName}
        meta={`Bats ${batSideText(pitch.matchup.batterSide)}`}
        role="Batter"
      />
    </section>
  );
}

function PlayerCard({ id, name, meta, role }: { id: string; name: string; meta: string; role: string }) {
  const headshotUrl = mlbHeadshotUrl(id);
  return (
    <div className="matchup-player">
      <div className="player-photo" aria-hidden="true">
        <span>{playerInitials(name)}</span>
        {headshotUrl ? (
          <Image
            alt=""
            className="player-photo-img"
            fill
            sizes="58px"
            src={headshotUrl}
            unoptimized
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
      <div>
        <p className="small-label">{role}</p>
        <strong>{name}</strong>
        <span>{meta}</span>
      </div>
    </div>
  );
}
