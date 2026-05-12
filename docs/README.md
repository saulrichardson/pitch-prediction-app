# Documentation

This directory contains the reusable doctrine and project-local decisions for
`Pitch Prediction App`.

## Read Order

1. `../AGENTS.md`
2. `project-profile.md`
3. `product-intent.md`
4. `engineering/agent-execution-protocol.md`
5. `engineering/definition-of-done.md`
6. `engineering/doctrine.md`
7. `architecture/system-map.md`
8. `architecture/stack-profile.md`
9. Relevant contracts in `contracts/`
10. Relevant threat model in `security/`
11. Relevant ADRs in `adr/`
12. Relevant templates in `templates/`

## Ownership Model

The reusable doctrine gives the project a starting point. The project owns the
generated files after creation.

Use `product-intent.md` for freeform notes about what the product is actually
trying to do. Promote stable facts from that file into `project-profile.md`,
contracts, feature briefs, ADRs, or tests when implementation starts depending
on them.

Use ADRs when a local decision changes architecture, authority, persistence,
workflow behavior, tool capabilities, or deployment strategy.
