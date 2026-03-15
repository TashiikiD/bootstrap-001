# AIES Audit Radar Memory

This directory is the durable persistence root for AIES layer-audit artifacts.

Why it lives under `memory/knowledge/`:
- snapshots should survive restarts and remain available across sessions
- audit findings should stay operator-visible and diffable in-repo
- the audit radar is a durable self-knowledge surface, not transient runtime state

Planned layout:
- `snapshots/` — structured layer-audit snapshots using `aies/contracts/layer-audit-snapshot.ts`
- optional human-readable reports can live alongside the structured snapshots later if the runtime needs them
