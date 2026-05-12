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
- `completed`: final actual pitch has been revealed and committed to history

Events:

- `RevealActual`
- `AdvanceActual`
- `StepBackActual`

Rules:

- `RevealActual` is valid only when the current pitch exists and actual fields
  are hidden from the browser.
- `AdvanceActual` is valid only after `RevealActual`.
- `AdvanceActual` commits the revealed pitch and its pre-pitch forecast to
  actual history before requesting the next prediction.
- Repeated `AdvanceActual` at the final pitch is idempotent for history and
  forecast records.
- `StepBackActual` from `actual_revealed` hides the current actual pitch again.
- `StepBackActual` from `actual_hidden` returns to the previous revealed pitch.

Terminal states:

- The timeline is completed when the final actual pitch has been revealed and
  committed to history.

Audit events:

- `timeline.created`
- `timeline.revealed`
- `timeline.advanced`
- `timeline.stepped_back`

Verification:

- valid reveal, advance, final advance, and back-step transitions are covered
  by domain tests
- advancing before reveal is rejected
- unrevealed actual pitch fields are redacted from browser DTOs
