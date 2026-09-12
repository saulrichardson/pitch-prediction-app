# Project Records

Records are durable project memory.

Use this directory for anything future agents should understand after the
current task is over: decisions, caveats, stack choices, architecture rationale,
risks, constraints, lessons, operating notes, feature context, and important
tradeoffs.

Create a record when the reasoning matters more than the current edit.

Use short dated filenames:

```text
YYYY-MM-DD-short-topic.md
```

Examples:

```text
2026-01-15-frontend-stack.md
2026-01-20-report-export-caveats.md
2026-02-03-billing-state-model.md
2026-02-10-deployment-notes.md
```

## Shape

```markdown
# <record title>

- date: YYYY-MM-DD

## Context

What happened, changed, or became clear?

## Record

What should future agents know, preserve, choose, avoid, migrate, or revisit?

## Evidence

What code, tests, commands, examples, data, user feedback, production signals,
or constraints support this record?

## Future Guidance

How should this affect later work?
```

## Practical Rule

Use `product-intent.md` for the product north star.

Use `approach.md` for the current stack, architecture, constraints, and delivery
model.

Use records for the reasoning that explains how the project got here and what
future agents should remember.
