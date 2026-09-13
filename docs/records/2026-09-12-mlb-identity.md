# MLB identity and photography

- date: 2026-09-12

## Context

The owner requested elegant use of MLB photography, logos, and team colors and
stated that approval to use that content had been obtained. The existing
porcelain, graphite, and cobalt scorecard remains the interface foundation.

## Decision

Place official player portraits under the away and home teams in the featured
matchup, with explicit Batting and Pitching labels. Determine affiliation from
the inning half: in the top half, the home team pitches; in the bottom half, the
away team pitches. Compact portraits accompany the player names in the replay.
Team marks identify games in the catalog and scoreboard; phone scoreboards use
the marks with scores while retaining the team abbreviations for assistive
technology.

Team colors appear in the paired rule, portrait backgrounds, and portrait edge.
They do not replace the stable action, forecast, and actual colors. Marks use
MLB's light and dark variants. The solid orange Mets mark is used in both themes
because it remains clearer against graphite than the outlined blue version.
Unknown teams retain their supplied text without an invented logo or affiliation.

## Assets And Sources

- `mlb-teams.json` records the 30 team IDs, names, and abbreviations verified
  against `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=2026`.
- Official mark sources are
  `https://www.mlbstatic.com/team-logos/team-cap-on-{light|dark}/{teamId}.svg`.
  Accent colors come from the supplied artwork. The 59 used SVG variants live in
  `apps/web/src/assets/mlb/teams/`; preserve the artwork when refreshing assets.
- Portraits use MLB's player-ID image service:
  `https://img.mlbstatic.com/mlb-photos/image/upload/w_320,q_auto:good,f_auto/v1/people/{playerId}/headshot/silo/current`.
  The official [Francisco Lindor profile](https://www.mlb.com/player/francisco-lindor-596019)
  links the same MLB photo service and team-logo service. The transparent silo
  portrait format was verified directly with MLB. These are current player
  portraits, not photography from the replayed pitch.

Static logo imports produce content-hashed URLs under `/_next/static/media`,
which already receives CloudFront caching. The logo payload totals less than
200 KB across all teams and themes; a page requests only its displayed marks.
Portraits are resized by MLB's CDN and loaded directly, without extra replay API
work or Lambda image optimization. Reserved image dimensions prevent layout
shifts. A failed portrait becomes initials; neither pending nor failed image
requests can block Start, Reveal, or Next. Invalid player IDs never produce an
external photo request.

## Verification And Delivery

Pure tests cover top/bottom player affiliation, unknown teams, and invalid
portrait identifiers. The browser regression holds photo requests open through
Start and Reveal, then fails them, verifies initials and theme-aware local
logos, and advances again. Manual browser checks cover loaded photography,
light/dark modes, the opening, replay, and game catalog, including 320-pixel
phones. The existing replay, preparation, and recovery tests remain applicable.

Ship through the normal web-only CI and deployment path. No model, saved
edition, schema, budget, or preparation-worker changes are needed. Verify live
portraits, cached logo responses, and saved replay commands after deployment.
