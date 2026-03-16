---
id: "memory-derived-evidence-index-keeps-files-primary-20260316T080356Z"
title: "Derived evidence index keeps files primary"
kind: "decision"
created_at: "2026-03-16T08:03:56.900845Z"
cycle_id: ""
session_id: "E:\\Coding\\AIES-runs\\bootstrap-001\\.aies-runtime\\sessions\\2026-03-16T02-32-30-822Z_c108ef54-58ff-4ed9-a1bd-6f927081992f.jsonl"
focus_type: "capability_expansion"
sensitivity: "internal"
related_change_id: "CHG-2026-03-16-evolution-evidence-index"
source_evidence:
  - "The evolution evidence index now rebuilds from curated durable artifacts instead of requiring transcript mining or a new database substrate."
  - "The query surface and operator-visible panel can answer continuity questions with source-path citations."
  - "The validation smoke proved both positive retrieval on a real cross-cycle thread and honest empty results for an unsupported query."
tags:
  - "decision"
  - "aiesv2"
  - "context"
  - "coherence"
  - "evaluation"
  - "harness"
  - "memory"
---
## Summary
Treat the file corpus as the primary authored memory surface and use a rebuildable structured evidence index as a derived retrieval layer.

## Why This Is Durable
This split preserves legibility for the operator and later cycles while making continuity questions cheaper to answer. The index is useful because it is bounded, cited, and advisory-only; it compresses history for judgment without becoming a hidden source of truth.

## Evidence
- The latest retrieval surface can reconstruct real change threads from OpenSpec, devlog, audit, and theory artifacts.
- The latest smoke validation showed unsupported questions returning zero matches instead of invented support.
- The current pattern improved context reconstruction without requiring recursive orchestration or transcript-scale ingestion.
