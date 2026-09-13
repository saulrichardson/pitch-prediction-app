# Cobalt palette refinement

- date: 2026-09-12

## Context

After the refined-scorecard pass, the owner requested a stronger color scheme.
The warm green neutrals and clay action made the interface feel earthy; dark
mode carried a green cast. The manifest also retained unrelated navy and teal
colors from an earlier design.

## Decision

Keep the scorecard layout and typography. Use porcelain, graphite, and cobalt
for the interface, blue for forecasts, and copper for actual pitches. Plot
geometry uses neutral gray so the two data markers remain the color focus.
Marker shapes and labels continue to distinguish forecast from actual.

Light mode uses a saturated cobalt action with white text. Dark mode uses a
lighter blue action with ink text, brighter data colors, and neutral elevated
surfaces. The shared `--color-on-primary` token owns button text in both themes;
never assume a primary button always takes white text. Focus rings, links,
progress, and the brand mark use the action accent consistently.

The favicon and standalone manifest follow the light palette. Viewport metadata
supplies matching light and dark theme colors for supporting browser chrome.
Keep these colors aligned with the stylesheet when changing the palette.

## Verification And Delivery

Calculated contrast for normal text and semantic colors against canvas, surface,
and tinted backgrounds is at least 4.68:1. Primary button text is 5.78:1 in light
mode and 7.10:1 in dark mode; hover states are higher. The strike-zone outline
exceeds 3:1 against its fill in both themes. Fine internal guides and decorative
dividers are intentionally quieter.

Browser inspection covers the opening, forecast/reveal comparison, game picker,
keyboard focus, and narrow phone layout in both themes. Run the existing checks
and CI before the web-only deployment; smoke-check saved production editions to
verify the release without spending model attempts. This change requires no
model, preparation, schema, or data migration.
