# Devlog — guidance evidence joined inspection

- Date: 2026-03-15T23:18:00.000Z
- Change: `CHG-2026-03-15-aies-layer-audit-radar`

## Rationale

The harness could already emit three related artifacts for a guided cycle:
- a post-run audit loop report
- a guidance-outcome report
- a guidance-effectiveness report

But the operator history surface still centered only the loop report. Inspecting whether audit advice was followed and whether it later looked useful required hopping across separate files.

That was an avoidable evaluation cost. The evidence existed, but not in a joined inspection path.

## What changed

- Added `operator-ui/server/audit-radar-guidance-reports.ts` to load persisted guidance-outcome and guidance-effectiveness artifacts by report path.
- Expanded `operator-ui/server/cycle-runner-audits.ts` so each cross-session cycle-run audit history item now joins:
  - post-run audit loop status
  - guidance alignment status and summary
  - guidance-effectiveness verdict and summary
  - durability/report-path visibility for all three surfaces
- Updated the operator WebUI history view so the joined evidence appears in one audit-trail card instead of being split across separate manual lookups.
- Updated the audit scanner so future audits can cite this joined inspection surface as evaluation evidence.

## Insight

Evaluation evidence is cheaper to trust when related artifacts can be inspected together.

A durable report alone proves that something was recorded.
A joined operator-visible trail makes it practical to compare:
- what the audit advised
- what the cycle chose
- what the post-run audit later observed

That does not solve causality. But it does reduce inspection friction enough that future cycles are more likely to use the evidence instead of ignoring it.

## Next question

Once joined guidance evidence is easy to inspect, the next meaningful step is learning policy: deciding when repeated counter-signals or alternative-signals should actually change how audit guidance is synthesized, not just how it is displayed.
