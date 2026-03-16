---
change_id: CHG-2026-03-15-aies-layer-audit-radar
title: Build a theory-grounded AIES layer audit radar
status: completed
updated_at: 2026-03-16T02:00:00.000Z
completed_at: 2026-03-16T02:00:00.000Z
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
  - Added `aies/extensions/verification/change-scope.ts` plus cycle-runner/audit-loop wiring so verification can be floored by the actual file surface introduced during a cycle instead of relying only on prompt/focus heuristics.
  - Validation: ran `/audit-radar-loop`, producing `audit-loop-2026-03-15T16-33-02-358Z`, `audit-outcomes-2026-03-15T16-32-38-492Z`, and `audit-2026-03-15T16-32-37-125Z`; the loop’s quick verification recorded `fast/passed` with no recovery entry.
  - Validation: re-ran `/audit-radar-assess`, producing `audit-2026-03-15T17-06-59-001Z`; evaluation and harness stayed partial, but the cited gap advanced from “manual command only” to “cycle orchestration hook exists but still lacks a durable cycle-runner-exercised loop report.”
- [x] Lower post-run audit proof inspection cost with operator-visible history.
  - Added `operator-ui/server/audit-radar-loops.ts` and `operator-ui/server/cycle-runner-audits.ts` so the operator surface can load durable audit-loop reports plus cross-session cycle-runner post-run audit trails without requiring another autonomous cycle just to inspect them.
  - Expanded the operator UI live/history state to surface latest loop provenance, loop verification, loop report paths, and recent cycle-run audit trails, making orchestration evidence cheaper to inspect from the existing transparency surface.
  - Updated `aies/extensions/evaluation/audit-radar-scanner.ts` so future audits can cite the new lightweight proof-inspection surface as harness evidence instead of only citing the orchestration hook itself.
- [x] Turn durable audit state into explicit next-cycle guidance.
  - Added `aies/extensions/evaluation/audit-radar-guidance.ts` plus `/audit-radar-next`, which compress the latest durable audit snapshot, drift pressure, and latest audit-loop evidence into a reusable execution brief instead of leaving the audit as descriptive status text.
  - Wired the guidance brief into evaluation prompt-context injection and the synthesized `/cycle-run` prompt so future cycles receive a compact audit-backed planning hint before choosing work.
  - Updated audit scanner and assessment rules so future audits can recognize the planning-bridge capability and shift the next evaluation question toward whether guidance measurably changes focus selection over time.
- [x] Measure whether audit guidance is actually being followed.
  - Added `aies/extensions/evaluation/audit-radar-guidance-outcomes.ts`, which defines durable guidance-outcome reports that compare a captured audit guidance brief against the focus the harness later chose.
  - Wired `aies/extensions/cycle-runner/index.ts` to carry the captured guidance through `/cycle-run`, persist a `guidance-outcomes/` report after completion, and expose the report path in cycle-runner status.
  - Added `/audit-radar-guidance-review` plus scanner/assessment updates so future audits can distinguish "guidance exists" from "guidance was exercised and compared against real focus selection."
- [x] Compare whether followed guidance correlated with later audit movement.
  - Added `aies/extensions/evaluation/audit-radar-guidance-effectiveness.ts` plus `/audit-radar-guidance-effectiveness`, which link durable guidance-outcome reports to the same cycle's post-run audit loop, correction-path outcome comparison, and scope-aware verification floor.
  - Guidance-effectiveness reports now persist under `memory/knowledge/audit-radar/guidance-effectiveness/` so later cycles can review whether aligned guidance produced supportive, counter, alternative, mixed, or insufficient signals.
  - Wired `aies/extensions/cycle-runner/index.ts` to emit a one-cycle guidance-effectiveness report automatically after guided `/cycle-run` completion, so the comparator no longer depends only on later manual command use.
  - Updated audit scanner and assessment rules so future audits can distinguish "guidance aligned with focus" from "guidance alignment correlated with later audit movement."
- [x] Join guided-cycle evidence into one operator-visible audit trail.
  - Added `operator-ui/server/audit-radar-guidance-reports.ts` and expanded `operator-ui/server/cycle-runner-audits.ts` so cross-session audit history can load guidance-outcome and guidance-effectiveness artifacts directly from their persisted report paths instead of only showing the post-run audit loop.
  - Updated `operator-ui/src/main.ts` and `operator-ui/src/types.ts` so the WebUI history view exposes guidance alignment, effectiveness verdicts, durability, and report paths alongside each cycle-run audit trail.
  - Updated `aies/extensions/evaluation/audit-radar-scanner.ts` so future audits can cite the joined proof-inspection surface as evaluation evidence instead of requiring manual artifact hopping.
- [x] Record the experiment back into memory.
  - Added `memory/devlog/2026-03-15T17-43-18-559Z-audit-radar-orchestration-proof-cost.md` to capture the key observation from this stage of the change: the audit correctly identified an orchestration evidence gap, but forcing proof by launching another autonomous cycle would spend the turn on recursive harness validation.
  - Added `memory/devlog/2026-03-15T21-03-32-538Z-scope-aware-verification-floor.md` to record the next harness observation: prompt/focus-inferred verification is weaker than verification floored by the files a cycle actually changed.
  - Added `memory/devlog/2026-03-15T21-26-23-000Z-guidance-effectiveness-bridge.md` to capture the next evaluation observation: guidance alignment is not yet guidance effectiveness unless it can be compared against later audit movement.
  - Added `memory/devlog/2026-03-15T22-05-00-000Z-guidance-effectiveness-orchestration.md` to capture the follow-on harness observation: once the comparator exists, guided cycle orchestration should emit the effectiveness evidence automatically instead of depending on later manual command use.
  - Added `memory/devlog/2026-03-15T23-18-00-000Z-guidance-evidence-joined-inspection.md` to record the next evaluation/harness observation: durable guided-cycle evidence is more likely to steer later work when the operator surface joins loop, alignment, and effectiveness artifacts into one inspection trail.
  - Updated `memory/theory-fork/meta/evaluation.md` and `memory/theory-fork/meta/harness.md` with explicit experiment notes distinguishing passive evidence from active orchestration proof, warning against metric-farming the audit loop, and separating guidance alignment from guidance effectiveness.

## Completion Note

The audit radar is complete through guidance synthesis, effectiveness measurement, and operator-visible evidence trails. Speculative meta-evaluation layers (learning posture, posture review, experiment planner, experiment execution review, experiment decision) were built on top of this but removed by the operator because they had no real data to operate on and were creating a self-referential loop that consumed cycles without producing meaningful evolution. The guidance pipeline should remain advisory — it informs judgment, it does not prescribe action.

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
