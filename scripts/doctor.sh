#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

fail() {
  printf 'doctor: %s\n' "$1" >&2
  exit 1
}

need_file() {
  [ -f "$1" ] || fail "missing required file: $1"
}

need_dir() {
  [ -d "$1" ] || fail "missing required directory: $1"
}

need_file AGENTS.md
need_file README.md
need_file .copier-answers.yml
need_file docs/project-profile.md
need_file docs/product-intent.md
need_file docs/engineering/agent-execution-protocol.md
need_file docs/engineering/definition-of-done.md
need_file docs/engineering/doctrine.md
need_file docs/engineering/feature-development.md
need_file docs/engineering/deployment-readiness.md
need_file docs/engineering/formal-methods.md
need_file docs/architecture/system-map.md
need_file docs/architecture/stack-profile.md
need_file docs/contracts/README.md
need_file docs/contracts/state-machines.md
need_file docs/contracts/tool-registry.md
need_file docs/contracts/model-service.md
need_file docs/contracts/workflow-events.md
need_file docs/contracts/policy-inputs.md
need_file docs/contracts/telemetry-events.md
need_file docs/security/threat-model.md
need_file docs/adr/README.md
need_file docs/adr/0001-adopt-agentic-engineering-doctrine.md
need_file docs/templates/adr.md
need_file docs/templates/feature-brief.md
need_file docs/templates/agent-task.md
need_file docs/templates/threat-model.md
need_file docs/templates/tool-capability.md
need_file docs/templates/state-machine.md
need_dir docs/engineering
need_dir docs/architecture
need_dir docs/contracts
need_dir docs/security
need_dir docs/adr
need_dir docs/templates

if grep -RIn --exclude='.copier-answers.yml' --exclude-dir='.git' '{{\|}}\|{%\|%}' AGENTS.md README.md docs >/tmp/agentic-template-unrendered.$$ 2>/dev/null; then
  cat /tmp/agentic-template-unrendered.$$
  rm -f /tmp/agentic-template-unrendered.$$
  fail "found unrendered template markers"
fi
rm -f /tmp/agentic-template-unrendered.$$

if ! grep -q '_src_path:' .copier-answers.yml; then
  fail ".copier-answers.yml does not record _src_path"
fi

if ! grep -q 'Autonomous agents may propose code, plans, and actions' AGENTS.md; then
  fail "AGENTS.md is missing the core doctrine boundary"
fi

if ! grep -q 'Language And Tooling Guidance' AGENTS.md; then
  fail "AGENTS.md is missing the language and tooling guidance"
fi

if ! grep -q 'Documentation Map' AGENTS.md; then
  fail "AGENTS.md is missing the documentation map"
fi

if ! grep -q 'docs/product-intent.md' AGENTS.md; then
  fail "AGENTS.md is missing product-intent guidance"
fi

if ! grep -q 'Implementation Language Guidance' docs/architecture/stack-profile.md; then
  fail "stack profile is missing the implementation language guidance"
fi

if ! grep -q 'Evidence Over Assumption' AGENTS.md; then
  fail "AGENTS.md is missing evidence-over-assumption guidance"
fi

if ! grep -q 'Instruction Interpretation Mode' docs/engineering/agent-execution-protocol.md; then
  fail "agent execution protocol is missing instruction interpretation mode"
fi

if ! grep -q 'First-Class Change Rule' docs/engineering/doctrine.md; then
  fail "engineering doctrine is missing the first-class change rule"
fi

if ! grep -q 'Root Cause Before Patch' docs/engineering/agent-execution-protocol.md; then
  fail "agent execution protocol is missing root-cause guidance"
fi

if ! grep -q 'Reporting Judgment' docs/engineering/agent-execution-protocol.md; then
  fail "agent execution protocol is missing reporting judgment guidance"
fi

printf 'doctor: ok\n'
