# Devlog — guidance effectiveness bridge

- Date: 2026-03-15T21:26:23.000Z
- Change: `CHG-2026-03-15-aies-layer-audit-radar`

## Rationale

The audit radar could already do two useful but incomplete things:
- produce next-cycle guidance
- record whether a later cycle followed that guidance

That still left a judgment gap. Alignment is not the same thing as effectiveness. A cycle can obey the guidance and leave the targeted weak layers stagnant, or diverge from the guidance and still improve the binding constraint for reasons the audit should learn from.

## What changed

- Added `aies/extensions/evaluation/audit-radar-guidance-effectiveness.ts`
- Added `/audit-radar-guidance-effectiveness`
- Persisted a new report family under `memory/knowledge/audit-radar/guidance-effectiveness/`
- Linked each guidance-outcome report to the nearest matching post-run audit loop, its outcome comparison, and the cycle's scope-aware verification floor
- Classified each guided run as a `supportive_signal`, `counter_signal`, `alternative_signal`, `mixed_signal`, or `insufficient_evidence`

## Insight

The important distinction is now explicit:
- **guidance alignment** asks whether the harness followed its own advice
- **guidance effectiveness** asks whether following that advice correlated with later audit movement worth trusting

This is still correlational. It does not solve attribution when several interventions overlap. But it is a better bridge from descriptive evaluation to operational judgment, because future cycles can now inspect whether obedient guidance was useful, neutral, or outperformed by divergence.

## Next question

If repeated guidance-effectiveness reports accumulate, AIES should start tuning how it synthesizes guidance: which target dimensions, suggested paths, and verification expectations actually predict improvement versus repeated stagnation.
