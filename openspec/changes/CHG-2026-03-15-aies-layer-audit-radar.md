---
change_id: CHG-2026-03-15-aies-layer-audit-radar
title: Build a theory-grounded AIES layer audit radar
status: proposed
---

## Summary
AIES has theory assets, durable memory, and several runtime extensions, but it still lacks a native capability for evidence-backed self-audit across the full 5+2 stack. That gap makes future cycles too dependent on ad-hoc judgment, encourages maintenance drift, and weakens the bridge between theory, evaluation, and actual evolution planning.

This change proposes a new `AIES layer audit radar`: a repo-native audit capability that inspects the harness against the AI-Human Engineering Stack, produces a structured component map with concrete evidence, identifies the current binding constraint, tracks drift over time, and turns findings into operator-visible next-step recommendations. The goal is not cosmetic scoring; it is to give future cycles a better compass for ambitious, theory-grounded evolution.

## Tasks
- [x] Define the audit snapshot contract.
  - Created `aies/contracts/layer-audit-snapshot.ts` with a serialization-friendly schema for seven-component audit snapshots, evidence items, binding-constraint rationale, and recommended next step.
  - Chose `memory/knowledge/audit-radar/snapshots/` as the durable snapshot store so audits survive restarts and can be compared across sessions.
- [x] Implement a repo scanner for audit evidence.
  - Added `aies/extensions/evaluation/audit-radar-scanner.ts` and the `/audit-radar-scan` command to read curated surfaces such as `AGENTS.md`, `memory/`, `openspec/`, `aies/extensions/`, `operator-ui/`, and `.pi/`.
  - The scanner now extracts explicit cited evidence for prompt, context, intent, judgment, coherence, evaluation, and harness layers instead of guessing, and reports any dimensions still missing evidence.
- [ ] Implement theory-grounded layer assessment logic.
  - Translate the local audit protocol into explicit rules for classifying each layer as strong, partial, or missing.
  - Include anti-Goodhart guardrails so the system prefers cited evidence and identified gaps over flattering self-ratings.
- [ ] Add binding-constraint and drift detection.
  - Compare snapshots over time to detect repeated maintenance loops, neglected layers, and theory/runtime divergence.
  - Produce one explicit highest-leverage next step rather than an unfocused list.
- [ ] Surface the audit in AIES runtime tools.
  - Add a command and/or operator-visible widget/report for the latest audit summary, binding constraint, and suggested change direction.
  - Make it easy for future cycles to use the audit when choosing work.
- [ ] Connect audit output to planning.
  - Add a path from audit findings to OpenSpec proposal drafting so the harness can turn diagnosed gaps into multi-cycle changes.
  - Pilot the flow by generating at least one follow-on change from a real audit snapshot.
- [ ] Record the experiment back into memory.
  - Write devlog and theory-fork updates on what the audit got right, what it missed, and how the harness should evaluate itself without collapsing into shallow score-chasing.

## Notes
- This change directly targets the coherence, evaluation, and harness meta-functions while also improving future work selection across all layers.
- The proposal is grounded in `docs/foundations/AI-Human-Stack-Agent-Audit-Protocol.md`, `memory/knowledge/coherence-charter.yaml`, `memory/knowledge/intent-hierarchy.yaml`, and the theory-fork evaluation/harness notes.
- The key experiment is whether a structured self-audit actually changes future cycle quality: fewer maintenance loops, clearer binding constraints, and more ambitious yet justified OpenSpec proposals.
- Avoid false precision. If evidence is weak, the audit should say so instead of inventing certainty.
- Expected outcome: future cycles become less reactive and more strategically self-directing because they can see, with citations, what AIES is missing right now.
