# Contract Catalog

This directory is the durable home for project contracts that should not be
buried only in source comments, route handlers, or tribal knowledge.

Contracts are the named boundaries other code relies on:

- state machines
- model service request/response behavior
- side-effect capabilities
- workflow events
- policy inputs
- telemetry and audit events
- database invariants

When a change adds or changes a contract, update this catalog in the same change
or explain why the contract is documented elsewhere.

## Files

- `state-machines.md`: lifecycle states, events, guards, and terminal states
- `model-service.md`: pitch model service boundary, validation, and failure
  behavior
- `tool-registry.md`: side-effect capability registry
- `workflow-events.md`: workflow events, retry semantics, and idempotency notes
- `policy-inputs.md`: policy decision inputs and authority model
- `telemetry-events.md`: trace, log, metric, and audit event names

## Contract Rule

If another module, workflow, tool, policy, or external integration must depend
on a shape or lifecycle, it is a contract. Name it here.
