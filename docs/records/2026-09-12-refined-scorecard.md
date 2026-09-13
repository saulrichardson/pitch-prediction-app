# Refined scorecard design

- date: 2026-09-12

## Context

The user requested another extensive design pass focused on enjoyable,
opinionated minimalism. The saved replay and seven-day browser were working,
but the enclosing comparison card, small plot, decorative opening illustration,
and repeated status labels diluted the hierarchy.

## Decision

Use a refined scorecard as the visual model. Keep one functional focal point:
the forecast and actual pitch in the same coordinate frame. Warm paper,
charcoal, muted green, and clay replace the cooler navy palette. The existing
Barlow Condensed and Source Sans 3 pair now has a consistent division of work:
display type for pitches, team abbreviations, and key values; body type for
names, context, and actions. No new font or animation dependency is needed.

The subsequent [palette refinement](2026-09-12-cobalt-palette.md) supersedes the
green and clay color choice while retaining this layout and type system.

The comparison has three open columns on desktop. On phones, forecast and
actual remain parallel and the shared diagram sits below them. The plot is
larger, loses the ornamental dot grid, and retains every coordinate, clipping
indicator, missing-data note, and pre-pitch strike-zone rule. The actual marker
only fades; animation must not move it away from its measured location.

The opening attaches Start replay directly to the featured game. A home-plate
mark replaces the generic letter icon. Game rows put the matchup on one line;
full names remain visible on desktop and in every row's accessible name. Ready,
Prepare replay, Preparing, doubleheader numbers, and unavailable-game statuses
retain their meaning. The preparation panel receives focus without an oversized
outline around the whole region.

Phone actions are fixed to the bottom viewport edge. A sticky toolbar could be
scrolled out of its expected position when the browser brought a control into
view. The page reserves bottom space so details remain reachable. Completion is
announced without adding a second visible status line that shifts the button.
About closes on an outside pointer action or Escape; Escape restores focus to
its trigger.

## Evidence And Delivery

The changes live in the replay composition, game browser, pitch plot, shared
stylesheet, and favicon. Manual browser inspection covers the opening, forecast,
reveal, game selection, queued preparation, and About at phone, tablet, and
desktop sizes, including a 320-pixel phone, both themes, and reduced motion.

Regression coverage in `tests/e2e/pitch-sequence-lab.spec.ts` verifies About
dismissal and focus, plus 320-pixel action placement through reveal, scrolling,
completion, and restart. Existing tests continue to cover saved cursors, failed
requests, game switching, preparation, and the plotted marker's position.

This is a web-only rollout through the existing CI and serverless deployment
script. There are no schema, model, budget, publication, or preparation-worker
changes. Live smoke checks should use already prepared editions and confirm the
deployed design without spending model attempts on additional games.

## Future Guidance

Keep the primary action stable and the information hierarchy deliberate. Add
explanation when it changes a decision or helps recover from a failure. Preserve
real measurements, missing values, forecast provenance, and spoiler boundaries
when simplifying the interface.
