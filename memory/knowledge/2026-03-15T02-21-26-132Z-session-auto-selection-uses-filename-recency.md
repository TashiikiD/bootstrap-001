---
id: "memory-manual-session-auto-selection-filename-recency-20260315T022126Z"
title: "Session auto-selection should follow filename chronology"
kind: "decision"
created_at: "2026-03-15T02:21:26.132Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-15T02-06-51-434Z_5f87e969-ce00-4a6a-b06c-38bfe31f0d52.jsonl"
focus_type: "repair_self_heal"
sensitivity: "internal"
related_change_id: ""
source_evidence:
  - "Current cycle evidence showed prompt-context risk around operator-control session targeting in auto mode."
  - "Session filenames already encode sortable creation timestamps, while file mtimes can drift when older sessions are touched."
tags:
  - "decision"
  - "aiesv2"
  - "session-selection"
  - "context-integrity"
---
## Summary
When operator controls are in `auto`, resolve the latest session from the session filename timestamp before falling back to file mtime or stored active-session paths.

## Why This Is Durable
Session mtimes change when sync, verification, or operator actions touch older files. Filename chronology is a more stable source for “latest session” semantics, so using it reduces prompt-context drift and mis-targeted operator actions.

## Evidence
- Auto-mode session targeting should follow session creation order, not whichever older file was last mutated.
- This affects cycle prompting, verification-mode adoption, and operator UI session selection.
