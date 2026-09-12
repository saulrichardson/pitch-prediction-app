# Docs Starter Pack Migration

- date: 2026-05-25

## Context

This repository was originally generated from
`gh:saulrichardson/agentic-engineering-template` at `v0.1.12`. The upstream
repository later changed from a Copier-based, heavy generated documentation
template into a smaller copyable starter pack.

The old local documentation structure included generated architecture,
engineering, contracts, templates, security, ADR, deployment, Copier metadata,
and a generated `scripts/doctor.sh` check. Current upstream starter guidance
uses four project-local surfaces:

```text
AGENTS.md
docs/product-intent.md
docs/approach.md
docs/records/
```

## Record

Pitch Prediction App follows the latest starter-pack documentation model. The
old generated documentation categories and Copier metadata are no longer part of
the repository operating model.

Project-specific durable facts from the old docs were migrated into
`docs/approach.md` and dated records under `docs/records/`.

## Evidence

- `AGENTS.md` now uses the latest starter-pack operating guide structure.
- `docs/README.md` points future agents to product intent, approach, and
  records.
- `docs/approach.md` contains the current stack, architecture, constraints,
  verification, and delivery model.
- `docs/records/` preserves the important project decisions formerly spread
  across ADRs, contracts, deployment docs, and the project profile.

## Future Guidance

Do not reintroduce the old generated documentation tree unless the project
deliberately chooses a heavier documentation system again. Keep project memory
small, current, and close to the decisions future agents need.
