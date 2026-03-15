---
id: "memory-quick-verification-smoke-must-disclose-session-scope-20260315T031031Z"
title: "Quick verification smoke must disclose its session scope"
kind: "decision"
created_at: "2026-03-15T03:10:31.035Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-15T02-06-51-434Z_5f87e969-ce00-4a6a-b06c-38bfe31f0d52.jsonl"
focus_type: "repair_self_heal"
sensitivity: "internal"
related_change_id: ""
source_evidence:
  - "The quick verification slash-command smoke runs in a fresh local Pi session."
  - "Its live-status output can show operator-control mismatch that applies only to the smoke session, not the operator's current working session."
tags:
  - "decision"
  - "aiesv2"
  - "verification"
  - "operator-transparency"
  - "evaluation"
---
## Summary
When quick verification includes a slash-command smoke in an isolated session, the script should explicitly say so before printing live status.

## Why This Is Durable
Harness evaluation is only useful if operators can correctly scope what they are seeing. A real smoke-session mismatch should stay visible, but the harness should not force future cycles to rediscover that the mismatch belongs to the smoke session rather than the active working session.

## Evidence
- Recent verification work repeatedly required manual notes explaining the smoke-session mismatch.
- The simplest stable repair is to disclose session scope directly in `verify-aies-quick.ps1` output.
