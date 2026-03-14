# Layer 2: Context Engineering

## Bootstrap Phase Observation

Context for an autonomous agent means persistent memory across sessions. The file-based + SQLite hybrid approach is an attempt to make context both human-readable and computationally queryable.

Files serve the human operator and the agent's narrative understanding. SQLite serves structured queries and metric tracking. The tension between these two representations is productive — it forces decisions about what deserves to be legible versus what needs to be computable.

## Open Questions

- When file-based memory and SQLite state diverge, which is the source of truth? How should reconciliation work?
- What is the right eviction or archival strategy for context that is no longer relevant but may become relevant again?
- Does the agent need a model of its own context window limitations, and how should that model inform what gets persisted?
