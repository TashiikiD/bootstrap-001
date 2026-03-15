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
- [x] Implement theory-grounded layer assessment logic.
  - Added `aies/extensions/evaluation/audit-radar-assessment.ts` and the `/audit-radar-assess` command to translate cited scanner evidence into explicit strong / partial / missing layer assessments.
  - The assessment engine uses conservative, anti-Goodhart rules: strong requires multiple cited artifacts and no unresolved protocol gap checks, while partial is preferred whenever evidence is real but incomplete.
- [x] Add binding-constraint and drift detection.
  - `/audit-radar-assess` now persists serialized snapshots under `memory/knowledge/audit-radar/snapshots/` and compares them against prior captures to flag stagnant weak layers, repeated binding constraints, maintenance-loop risk, and theory/runtime divergence.
  - The audit output keeps one explicit highest-leverage next step, and evaluation recommendations now move from persistence toward planning integration once durable snapshot comparison exists.
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
