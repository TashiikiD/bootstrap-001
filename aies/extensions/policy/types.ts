export const POLICY_MODES = ["off", "advisory", "soft-steer"] as const;

export type PolicyMode = (typeof POLICY_MODES)[number];

export function parsePolicyMode(raw: string | undefined): PolicyMode | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  return POLICY_MODES.includes(normalized as PolicyMode) ? (normalized as PolicyMode) : undefined;
}

