# State Machine Contracts

Use this file to record important project lifecycles. Do not let important
statuses become strings assigned from arbitrary code.

For each state machine, record the owner module, states, events, valid and
invalid transitions, guards, terminal states, audit events, and retry or
cancellation behavior where relevant.

## Pitch Replay Timeline

Owner module: `packages/domain/src/timeline.ts`

States:

- `actual_hidden`: current actual pitch is not revealed; prediction is visible
- `actual_revealed`: current actual pitch and evaluation are visible
- `branch_active`: an alternate or generated branch is selected
- `terminal_branch`: active branch ended in strikeout, walk, hit by pitch, or
  ball in play

Events:

- `RevealActual`
- `AdvanceActual`
- `ApplyAlternatePitch`
- `GeneratePitch`
- `CompareBranch`
- `ReturnToActual`

Rules:

- `AdvanceActual` is valid only after `RevealActual`.
- Branch events must append to branch history and must not mutate the actual
  timeline trunk.
- Model predictions are recomputed after actual advance and after each
  non-terminal branch pitch.
- Terminal branch states do not request another prediction until the user
  returns to actual or starts another branch.

Terminal states:

- branch-level terminal states are `strikeout`, `walk`, `hit_by_pitch`, and
  `ball_in_play`.

Audit events:

- `timeline.created`
- `timeline.revealed`
- `timeline.advanced`
- `branch.alternate_pitch`
- `branch.generated_pitch`

Verification:

- valid reveal and advance transitions are covered by domain tests
- advancing before reveal is rejected
- branch pitches append to branch history and do not mutate the actual trunk
- terminal branch states do not request another prediction
