# AIES Coherence Signals

This directory is the durable planning and persistence root for the proposed local/global coherence mapper from `CHG-2026-03-16-coherence-local-global-signals`.

Why it lives under `memory/knowledge/`:
- coherence judgments should remain operator-visible, diffable, and rebuildable from authored repo artifacts
- single-agent coherence in AIES is primarily about **cross-session behavioral consistency** and **architectural integrity**, which are better inspected from durable files than from transient runtime state
- future cycles need a shared taxonomy for classifying contradictions without turning coherence into a coercive scorekeeper

## Taxonomy

### Local coherence signal
A **local coherence** signal is evidence that a contradiction, drift pattern, or unresolved inconsistency is concentrated within one subsystem, workflow, or artifact family.

Use `scope: local` when:
- the evidence is primarily confined to one repo surface or extension family
- the contradiction can be explained without invoking system-wide theory/runtime drift
- the likely corrective action is local refactoring, local documentation repair, or a bounded follow-up change

Examples:
- repeated incompatible patterns inside one extension directory
- one operator surface disagreeing with its own underlying artifact contract
- a recurring hotspot in a single subsystem without corroborating cross-layer contradictions elsewhere

### Global coherence signal
A **global coherence** signal is evidence that the inconsistency spans multiple layers or durable surfaces and is more plausibly about whole-harness drift than a single local defect.

Use `scope: global` when the cited evidence crosses two or more of:
- theory (`memory/theory-fork/`)
- operational knowledge (`memory/knowledge/`)
- planning (`openspec/changes/`)
- runtime implementation (`aies/extensions/`, `operator-ui/`)
- cross-session memory (`memory/devlog/`)

A global signal should usually show at least one of:
- theory claims and runtime behavior diverging across multiple cycles
- repeated contradictions between intent/coherence artifacts and actual work selection
- architectural drift that cannot be explained by a single subsystem's local iteration

### Ambiguous coherence signal
An **ambiguous** signal has real contradiction evidence, but the available citations do not yet justify calling it local or global.

Use `scope: ambiguous` when:
- a pattern appears important but the evidence set is too thin or too recent
- the contradiction may be local but there are weak hints of broader drift
- multiple plausible explanations remain live

### Insufficient evidence
Use `status: insufficient_evidence` when the mapper cannot honestly support a coherence classification.

This is required when:
- only one weak artifact suggests a problem
- the contradiction depends on inference that cannot be cited directly
- the corpus is stale or missing the surfaces needed to evaluate scope

## Evidence expectations

The mapper should prefer cited, durable artifacts over inferred narratives.

Minimum expectations by scope:
- `local`: at least 2 directly relevant citations, with at least one from the implicated subsystem or artifact family
- `global`: at least 3 citations spanning at least 2 durability classes or layer surfaces
- `ambiguous`: at least 2 citations indicating a real tension, plus a plain explanation of what is missing
- `insufficient_evidence`: explicit statement of the missing proof surface

Recommended first input surfaces:
- `memory/knowledge/coherence-charter.yaml`
- `memory/knowledge/intent-hierarchy.yaml`
- `memory/theory-fork/index.md`
- `memory/theory-fork/layers/coherence.md`
- selected `openspec/changes/CHG-*.md`
- selected `memory/devlog/*.md`
- `memory/knowledge/evolution-evidence-index/`

## Initial signal families

The first implementation should stay bounded to a small set of advisory signal families:
- `subsystem_hotspot_concentration`
  - asks whether recent work is repeatedly clustering inside one subsystem with no visible cross-layer reconciliation
- `theory_runtime_mismatch`
  - asks whether theory or charter commitments are repeatedly ahead of operational behavior
- `intent_action_misalignment`
  - asks whether the ranked intent hierarchy says one thing while recent changes and devlogs repeatedly do another
- `cross_session_contradiction`
  - asks whether durable devlogs or changes tell inconsistent stories about what AIES learned or decided

These are advisory heuristics, not maturity scores.

## Redlines

The coherence mapper may:
- summarize cited contradictions
- classify them as `local`, `global`, `ambiguous`, or `insufficient_evidence`
- suggest candidate next inspection paths

The coherence mapper must not:
- auto-block a cycle from taking an action
- auto-score overall AIES coherence maturity from heuristic counts alone
- auto-select the next OpenSpec change
- treat repeated subsystem work as failure without examining whether the work was deliberate and recorded
- replace judgment-layer tradeoffs with a prescriptive planner

## Artifact shape guidance

A first durable report should stay small and legible. Each surfaced signal should include:
- `id`
- `title`
- `status`
- `scope`
- `signalFamily`
- `summary`
- `whyItMatters`
- `citations[]`
- `missingEvidence[]`
- `suggestedPaths[]`

## Implementation posture

The first implementation is allowed to say very little. A truthful map with one `local`, one `ambiguous`, and several `insufficient_evidence` results is better than a broad but speculative coherence dashboard.
