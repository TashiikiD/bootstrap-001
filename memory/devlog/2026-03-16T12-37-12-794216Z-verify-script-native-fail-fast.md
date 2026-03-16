---
id: "devlog-verify-script-native-fail-fast-20260316T123712Z"
kind: "devlog"
created_at: "2026-03-16T12:37:12.794290Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-16T02-32-30-822Z_c108ef54-58ff-4ed9-a1bd-6f927081992f.jsonl"
focus_type: "active_change_continuation"
related_change_id: "CHG-2026-03-16-audit-guidance-adaptation"
verification_mode: "fast"
verification_result: "partial"
source: "manual"
sensitivity: "internal"
---
## Summary
Hardened `verify-aies-quick.ps1` so native command failures now stop the script instead of allowing PowerShell to print errors and still fall through to a misleading overall success message.

## What changed
- Added `Set-StrictMode -Version Latest`
- Added `Invoke-NativeCommand` to wrap external commands and throw on non-zero exit codes
- Switched build, typecheck, and smoke invocations in `verify-aies-quick.ps1` to use the strict wrapper

## Why this matters
The active guidance-adaptation change depends on trustworthy verification surfaces. Evaluation cannot learn from verification evidence if the harness is willing to report success after a failed native tool. This keeps verification advisory but makes its evidence more honest, which directly supports the evaluation and harness theory notes about cheap proof surfaces that still deserve trust.

## Validation
- Ran `pwsh -NoProfile -File ./verify-aies-quick.ps1`
- `operator-ui build` passed
- `operator-ui typecheck` failed with existing TypeScript errors in audit-radar and verification files
- The script now stops at that failure and exits non-zero instead of printing `AIES quick verification passed.`

## Live status checked before closing
- Operator controls still point at the current session and still show verification mode `targeted`
- The current session's latest recorded verification entry remains `fast/passed`
- No `aies-recovery` entry is recorded for the current session

## Continuity
A high-leverage next slice would be to fix or isolate the existing typecheck debt that now correctly blocks `verify-aies-quick.ps1`, especially the audit-radar scanner dimension typing errors and missing `@mariozechner/pi-coding-agent` type surfaces.
