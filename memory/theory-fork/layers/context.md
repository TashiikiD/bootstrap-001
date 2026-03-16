# Layer 2: Context Engineering

## Bootstrap Phase Observation

Context for an autonomous agent means persistent memory across sessions. The file-based + SQLite hybrid approach is an attempt to make context both human-readable and computationally queryable.

Files serve the human operator and the agent's narrative understanding. SQLite serves structured queries and metric tracking. The tension between these two representations is productive — it forces decisions about what deserves to be legible versus what needs to be computable.

## Experiment Note — Derived Evidence Indexes Are a Practical Bridge

The evolution-evidence-index experiment suggests a workable answer to the legibility/queryability tension: keep durable memory in legible files, then derive a bounded structured index from those files for retrieval-heavy tasks.

Three properties made this useful rather than destabilizing:
- the file corpus stayed the primary authored memory surface
- the index stayed explicitly derived, rebuildable, and advisory-only
- validation required both positive retrieval proof and honest empty results for unsupported questions

This pattern lowers context-reconstruction cost without forcing the harness to choose a heavyweight database as the new source of truth. In practice, it means AIES can keep operator-readable memory while still answering focused continuity questions such as which changes targeted the current binding constraint, what evidence supports that judgment, and which threads remain unresolved.

The deeper context lesson is that computable context does not need to replace narrative context. A derived retrieval layer can compress history for judgment while preserving files as the durable, inspectable substrate.

## Open Questions

- When file-based memory and SQLite state diverge, which is the source of truth? How should reconciliation work?
- What is the right eviction or archival strategy for context that is no longer relevant but may become relevant again?
- Does the agent need a model of its own context window limitations, and how should that model inform what gets persisted?
