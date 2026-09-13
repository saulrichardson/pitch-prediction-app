import teams from "./mlb-teams.json";

export type TeamIdentity = (typeof teams)[number];

export function teamById(id: number): TeamIdentity | null {
  return teams.find((team) => team.id === id) ?? null;
}

export function teamByAbbreviation(abbreviation: string): TeamIdentity | null {
  return teams.find((team) => team.abbreviation === abbreviation) ?? null;
}

/** The saved game label is away @ home; the inning determines who is pitching. */
export function matchupIdentity(label: string, half: "top" | "bottom") {
  const [awayCode = "", homeCode = ""] = label.split(" @ ");
  const away = { code: awayCode, team: teamByAbbreviation(awayCode) };
  const home = { code: homeCode, team: teamByAbbreviation(homeCode) };
  return {
    away,
    home,
    pitcher: half === "top" ? home : away,
    batter: half === "top" ? away : home,
  };
}

export function playerPortraitUrl(id: string): string | null {
  if (!/^[1-9]\d{0,9}$/.test(id)) return null;
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_320,q_auto:good,f_auto/v1/people/${id}/headshot/silo/current`;
}

export function playerInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((_, index, words) => index === 0 || index === words.length - 1)
    .map((word) => Array.from(word)[0])
    .join("")
    .toLocaleUpperCase("en-US");
}
