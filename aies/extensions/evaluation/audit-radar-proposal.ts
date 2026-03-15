import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LayerAuditAssessment, LayerAuditSnapshot } from "../../contracts/layer-audit-snapshot.ts";
import { AIES_DIMENSIONS, type AiesDimension } from "../../contracts/primitives.ts";
import { getAiesPaths } from "../shared/paths.ts";
import { auditSnapshotRelativePath } from "./audit-radar-state.ts";

type ProposalProfile = {
  slug: string;
  title: string;
  summaryLead: string;
};

type AuditProposalDraft = {
  changeId: string;
  title: string;
  relativePath: string;
  selectedDimension: AiesDimension;
  sourceSnapshotPath: string;
  markdown: string;
};

const DIMENSION_PROFILES: Record<AiesDimension, ProposalProfile> = {
  prompt: {
    slug: "audit-prompt-template",
    title: "Add a first-class audit prompt template",
    summaryLead: "formalize how audits are requested and reported so prompt quality is repeatable instead of depending on command discoverability",
  },
  context: {
    slug: "audit-context-pack-builder",
    title: "Build an audit context pack builder",
    summaryLead: "turn durable memory into task-specific context packaging instead of relying on broad static roots",
  },
  intent: {
    slug: "audit-intent-propagation-bridge",
    title: "Strengthen the audit-to-OpenSpec intent bridge",
    summaryLead: "keep diagnosed gaps flowing into future work selection rather than letting intent stay declarative",
  },
  judgment: {
    slug: "audit-judgment-gate",
    title: "Add an audit judgment gate",
    summaryLead: "embed pause-and-doubt mechanisms so thin evidence cannot quietly earn strong ratings or trigger overconfident planning",
  },
  coherence: {
    slug: "coherence-drift-action-loop",
    title: "Turn coherence drift into an action loop",
    summaryLead: "make repeated drift warnings shape future cycle choices instead of remaining descriptive memory",
  },
  evaluation: {
    slug: "audit-correction-path-comparator",
    title: "Compare audit corrections against outcomes",
    summaryLead: "measure whether reconciled plans, verification actions, and other correction paths actually improve weak layers instead of assuming that plan updates helped",
  },
  harness: {
    slug: "audit-verification-command-chain",
    title: "Create a repeatable audit-plus-verification harness command",
    summaryLead: "reduce friction around running self-evolution checks consistently across cycles",
  },
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function firstNonStrongDimension(snapshot: LayerAuditSnapshot): AiesDimension {
  const stagnantCandidate = snapshot.drift?.stagnantDimensions.find((dimension) =>
    snapshot.dimensions.some((item) => item.dimension === dimension && item.tier !== "strong"));

  if (stagnantCandidate) {
    return stagnantCandidate;
  }

  return snapshot.dimensions.find((item) => item.tier !== "strong")?.dimension ?? snapshot.bindingConstraint.dimension;
}

function resolveDimension(rawArgs: string | undefined, snapshot: LayerAuditSnapshot): AiesDimension {
  const requested = (rawArgs ?? "").trim().toLowerCase();
  if ((AIES_DIMENSIONS as readonly string[]).includes(requested)) {
    return requested as AiesDimension;
  }
  return firstNonStrongDimension(snapshot);
}

function selectAssessment(snapshot: LayerAuditSnapshot, dimension: AiesDimension): LayerAuditAssessment {
  const selected = snapshot.dimensions.find((item) => item.dimension === dimension)
    ?? snapshot.dimensions.find((item) => item.dimension === snapshot.bindingConstraint.dimension)
    ?? snapshot.dimensions[0];

  if (!selected) {
    throw new Error("Audit snapshot does not contain any dimension assessments.");
  }

  return selected;
}

function makeUniqueChangeId(baseChangeId: string): string {
  const directory = getAiesPaths().openSpecChangesRoot;
  const existing = new Set(
    existsSync(directory)
      ? readdirSync(directory)
          .filter((name) => /^CHG-.*\.md$/i.test(name))
          .map((name) => name.replace(/\.md$/i, ""))
      : [],
  );

  if (!existing.has(baseChangeId)) {
    return baseChangeId;
  }

  let index = 2;
  while (existing.has(`${baseChangeId}-${index}`)) {
    index += 1;
  }

  return `${baseChangeId}-${index}`;
}

function createTaskLines(snapshot: LayerAuditSnapshot, assessment: LayerAuditAssessment): string[] {
  const suggestedPaths = snapshot.recommendedNextStep.suggestedPaths.length > 0
    ? snapshot.recommendedNextStep.suggestedPaths.join(", ")
    : "none yet";

  return [
    `- [ ] Build the ${assessment.dimension} capability described by the audit.`,
    `  - Implement: ${assessment.highestLeverageNextStep}`,
    `  - Keep the work grounded in the cited evidence and gaps instead of turning it into generic maintenance.`,
    `- [ ] Integrate the capability into native AIES runtime surfaces.`,
    `  - Prefer coherent hooks in evaluation, OpenSpec, memory, or operator-visible flows over isolated one-off scripts.`,
    `  - Start from these suggested paths when they fit: ${suggestedPaths}`,
    `- [ ] Validate the change against a real audit snapshot.`,
    `  - Re-run /audit-radar-assess and confirm the new capability changes evidence, recommendations, or drift interpretation in an observable way.`,
    `- [ ] Record the experiment back into memory.`,
    `  - Capture what the audit got right, what it still missed, and whether the intervention improved future cycle selection.`,
  ];
}

function buildSummary(snapshot: LayerAuditSnapshot, assessment: LayerAuditAssessment, profile: ProposalProfile): string[] {
  const driftSummary = snapshot.drift?.summary ?? "No prior drift comparison was available when this proposal was generated.";
  const gapSummary = assessment.gaps.length > 0
    ? assessment.gaps.join(" ")
    : `${assessment.dimension} is already relatively strong, so this proposal should be treated as opportunistic rather than urgent.`;
  const bindingText = snapshot.bindingConstraint.dimension === assessment.dimension
    ? `The same dimension is also the current binding constraint.`
    : `The current binding constraint remains ${snapshot.bindingConstraint.dimension}, but this proposal intentionally targets ${assessment.dimension} as the next concrete capability expansion.`;

  return [
    `Audit snapshot \`${snapshot.snapshotId}\` observed at \`${snapshot.observedAt}\` rated **${assessment.dimension}** as **${assessment.tier}**. ${assessment.summary}`,
    `${bindingText} Drift context: ${driftSummary}`,
    `This change proposes to ${profile.summaryLead}. The goal is to operationalize the audit's diagnosis — \`${assessment.highestLeverageNextStep}\` — so future cycles can act on evidence instead of repeatedly rediscovering the same weakness.`,
    gapSummary,
  ];
}

function buildNotes(snapshot: LayerAuditSnapshot, assessment: LayerAuditAssessment, sourceSnapshotPath: string): string[] {
  return [
    `- Generated by \`/audit-radar-propose\` from \`${sourceSnapshotPath}\`.`,
    `- Selected dimension: \`${assessment.dimension}\``,
    `- Binding constraint at generation time: \`${snapshot.bindingConstraint.dimension}\``,
    `- Evidence IDs: ${assessment.evidenceIds.length > 0 ? assessment.evidenceIds.join(", ") : "none"}`,
    `- Recommended action type at generation time: \`${snapshot.recommendedNextStep.actionType}\``,
    `- Suggested paths at generation time: ${snapshot.recommendedNextStep.suggestedPaths.length > 0 ? snapshot.recommendedNextStep.suggestedPaths.join(", ") : "none"}`,
    `- Failure patterns in scope: ${snapshot.failurePatterns.length > 0 ? snapshot.failurePatterns.join(" | ") : "none"}`,
  ];
}

function buildMarkdown(changeId: string, title: string, snapshot: LayerAuditSnapshot, assessment: LayerAuditAssessment, sourceSnapshotPath: string): string {
  const profile = DIMENSION_PROFILES[assessment.dimension];
  const summaryLines = buildSummary(snapshot, assessment, profile);
  const taskLines = createTaskLines(snapshot, assessment);
  const notes = buildNotes(snapshot, assessment, sourceSnapshotPath);

  return [
    "---",
    `change_id: ${changeId}`,
    `title: ${title}`,
    "status: proposed",
    `generated_from_audit_snapshot: ${snapshot.snapshotId}`,
    `generated_from_dimension: ${assessment.dimension}`,
    "---",
    "",
    "## Summary",
    ...summaryLines.map((line) => `${line}`),
    "",
    "## Tasks",
    ...taskLines,
    "",
    "## Notes",
    ...notes,
    "",
  ].join("\n");
}

export function createAuditDrivenOpenSpecChange(snapshot: LayerAuditSnapshot, rawArgs = ""): AuditProposalDraft {
  const selectedDimension = resolveDimension(rawArgs, snapshot);
  const assessment = selectAssessment(snapshot, selectedDimension);
  const profile = DIMENSION_PROFILES[assessment.dimension];
  const datePart = snapshot.observedAt.slice(0, 10);
  const baseChangeId = `CHG-${datePart}-${slugify(profile.slug)}`;
  const changeId = makeUniqueChangeId(baseChangeId);
  const relativePath = `openspec/changes/${changeId}.md`;
  const sourceSnapshotPath = auditSnapshotRelativePath(snapshot);
  const markdown = buildMarkdown(changeId, profile.title, snapshot, assessment, sourceSnapshotPath);

  return {
    changeId,
    title: profile.title,
    relativePath,
    selectedDimension: assessment.dimension,
    sourceSnapshotPath,
    markdown,
  };
}

export function persistAuditDrivenOpenSpecChange(draft: AuditProposalDraft): string {
  const fullPath = join(getAiesPaths().projectRoot, draft.relativePath);
  writeFileSync(fullPath, draft.markdown, "utf8");
  return draft.relativePath;
}
