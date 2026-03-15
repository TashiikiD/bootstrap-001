# AIES Audit Radar Memory

This directory is the durable persistence root for AIES layer-audit artifacts.

Why it lives under `memory/knowledge/`:
- snapshots should survive restarts and remain available across sessions
- audit findings should stay operator-visible and diffable in-repo
- the audit radar is a durable self-knowledge surface, not transient runtime state

Planned layout:
- `snapshots/` — structured layer-audit snapshots using `aies/contracts/layer-audit-snapshot.ts`
- `outcomes/` — durable correction-path comparison reports showing which interventions appeared between audits and whether weak layers improved
- `loops/` — durable end-to-end loop reports tying one audit run to its linked outcome comparison plus verification/recovery result
- `guidance-outcomes/` — durable reports comparing an audit guidance brief against the focus the harness actually chose on a later guided cycle
- optional human-readable reports can live alongside the structured snapshots later if the runtime needs them

Loop report notes:
- `orchestrationSource` distinguishes manual `/audit-radar-loop` invocations from future cycle-runner-triggered loop executions.
- This prevents the scanner from over-claiming orchestration evidence just because a manual loop report happened to reference the latest completed cycle.
