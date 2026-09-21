import type { ContrastPolicy } from "./color/solver";

/** The URL uses the same names as the policy tabs, not the engine's internal
 *  ids — a link should read like what was clicked. */
export const POLICY_SLUGS: Record<ContrastPolicy, string> = {
  "hue-first": "more-apca",
  "wcag-relaxed": "system-default",
  "wcag-strict": "wcag-strict",
};

/** `full-wcag`, before the rename to "WCAG Strict" — kept resolvable, never generated. */
const LEGACY_POLICY_SLUGS: Record<string, ContrastPolicy> = {
  "full-wcag": "wcag-strict",
};

const POLICY_FROM_SLUG: Record<string, ContrastPolicy> = {
  ...LEGACY_POLICY_SLUGS,
  ...Object.fromEntries(Object.entries(POLICY_SLUGS).map(([policy, slug]) => [slug, policy as ContrastPolicy])),
};

export const DEFAULT_POLICY: ContrastPolicy = "wcag-relaxed";

export function policyFromSlug(slug: string | null): ContrastPolicy {
  return POLICY_FROM_SLUG[slug ?? ""] ?? DEFAULT_POLICY;
}
