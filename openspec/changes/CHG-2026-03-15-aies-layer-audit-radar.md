---
change_id: CHG-2026-03-15-aies-layer-audit-radar
title: Build a theory-grounded AIES layer audit radar
status: active
updated_at: 2026-03-15T17:06:59.001Z
last_audit_snapshot: audit-2026-03-15T17-06-59-001Z
last_audit_reconciled_dimension: evaluation
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
- [x] Surface the audit in AIES runtime tools.
  - Added `/audit-radar-status`, which reports the latest durable audit summary, binding constraint, drift state, and suggested change direction from a stored snapshot.
  - Added an operator-visible Audit Radar panel in the WebUI plus prompt-context injection from the latest durable audit snapshot so future cycles can reuse the audit when choosing work.
- [x] Connect audit output to planning.
  - Added `/audit-radar-propose [dimension]`, which drafts a new `CHG-*.md` file from the latest durable audit snapshot and uses the selected layer's evidence, gaps, drift summary, and recommended paths to seed a multi-step plan.
  - Piloted the flow by generating a real follow-on change from a stored audit snapshot, proving that repeated audit findings can now become operator-visible OpenSpec work instead of staying advisory text.
- [x] Reconcile repeated audit findings into the active OpenSpec plan.
  - Added `aies/extensions/evaluation/audit-radar-reconciliation.ts` plus `/audit-radar-reconcile`, and taught `/audit-radar-propose` to update an aligned active change unless `--new` is passed.
  - Active-change reconciliation now appends structured audit context, avoids duplicate task injection by snapshot id, and updates OpenSpec frontmatter so repeated weak-layer findings can steer the current plan instead of only spawning more proposals.
  - The evaluation-layer audit rules now treat reconciliation as first-class evidence and move the next recommendation toward comparing which correction path actually improved later audits.
  - Validation: re-ran `/audit-radar-assess`, producing `audit-2026-03-15T15-26-58-985Z`; evaluation stayed partial, but the cited gap and recommended next step advanced from proposal-only planning to correction-path comparison.
- [x] Compare correction-path outcomes across audit intervals.
  - Added `aies/extensions/evaluation/audit-radar-outcomes.ts` plus `/audit-radar-outcomes`, which compares consecutive audit snapshots against observed OpenSpec reconciliation/proposal signals and session-level verification, recovery, and operator verification-mode entries.
  - Outcome reports now persist under `memory/knowledge/audit-radar/outcomes/` so later cycles can inspect whether prior weak layers improved, regressed, or stayed stagnant after specific interventions.
  - The evaluation-layer audit rules now treat durable outcome comparison as first-class evidence and move the next recommendation toward harness-automating the audit/verification/outcome loop.
  - Validation: ran `/audit-radar-outcomes`, producing `audit-outcomes-2026-03-15T15-58-06-342Z`, then re-ran `/audit-radar-assess`, producing `audit-2026-03-15T15-59-18-744Z`; evaluation stayed partial but its cited gap advanced to correlational-attribution limits and the recommendation shifted to a reproducible audit+outcome+verification command chain.
- [x] Wrap the audit learning loop into one reproducible harness command.
  - Added `aies/extensions/evaluation/audit-radar-loop.ts` plus `/audit-radar-loop`, which runs audit assessment, persists a fresh outcome comparison, executes `./verify-aies-quick.ps1`, records verification/recovery state, and emits a durable loop report under `memory/knowledge/audit-radar/loops/`.
  - The scanner and theory-grounded assessment rules now treat loop code plus loop reports as evaluation/harness evidence, so the audit can distinguish “native command exists” from “native command has been exercised on real sessions.”
  - Added `aies/extensions/cycle-runner/audit.ts` plus cycle-runner state/reporting updates so completed `/cycle-run` turns can invoke the audit loop automatically and record a visible post-run audit trail instead of relying only on manual `/audit-radar-loop` use.
  - Loop reports now carry an `orchestrationSource` field, allowing the audit scanner to distinguish manual command runs from future cycle-runner-triggered runs without over-claiming orchestration evidence.
  - Validation: ran `/audit-radar-loop`, producing `audit-loop-2026-03-15T16-33-02-358Z`, `audit-outcomes-2026-03-15T16-32-38-492Z`, and `audit-2026-03-15T16-32-37-125Z`; the loop’s quick verification recorded `fast/passed` with no recovery entry.
  - Validation: re-ran `/audit-radar-assess`, producing `audit-2026-03-15T17-06-59-001Z`; evaluation and harness stayed partial, but the cited gap advanced from “manual command only” to “cycle orchestration hook exists but still lacks a durable cycle-runner-exercised loop report.”
- [ ] Record the experiment back into memory.
  - Write devlog and theory-fork updates on what the audit got right, what it missed, and how the harness should evaluate itself without collapsing into shallow score-chasing.

## Notes
- This change directly targets the coherence, evaluation, and harness meta-functions while also improving future work selection across all layers.
- The proposal is grounded in `docs/foundations/AI-Human-Stack-Agent-Audit-Protocol.md`, `memory/knowledge/coherence-charter.yaml`, `memory/knowledge/intent-hierarchy.yaml`, and the theory-fork evaluation/harness notes.
- The key experiment is whether a structured self-audit actually changes future cycle quality: fewer maintenance loops, clearer binding constraints, and more ambitious yet justified OpenSpec proposals.
- Avoid false precision. If evidence is weak, the audit should say so instead of inventing certainty.
- Expected outcome: future cycles become less reactive and more strategically self-directing because they can see, with citations, what AIES is missing right now.

## Audit Radar Reconciliation
### audit-2026-03-15T06-48-19-161Z
- observed_at: 2026-03-15T06:48:19.161Z
- source_snapshot: memory/knowledge/audit-radar/snapshots/2026-03-15T06-48-19-161Z--audit-2026-03-15T06-48-19-161Z.json
- binding_constraint: evaluation
- selected_dimension: evaluation
- decision: merged the repeated evaluation finding into the active change by adding a native reconciliation path instead of generating another proposal-only loop
- rationale: the active change already targets audit/planning behavior and the audit explicitly recommended connecting drafting to active-change reconciliation
- highest_leverage_next_step_at_capture: Connect audit drafting to active-change reconciliation so repeated findings can update existing plans instead of only creating new proposals.
