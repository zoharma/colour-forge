import { describe, expect, it } from "vitest";

import { POLICY_SLUGS, DEFAULT_POLICY, policyFromSlug } from "../src/urlPolicySlug";
import type { ContrastPolicy } from "../src/color/solver";

describe("policy URL slugs", () => {
  it("round-trips every current policy through its own slug", () => {
    for (const policy of Object.keys(POLICY_SLUGS) as ContrastPolicy[]) {
      expect(policyFromSlug(POLICY_SLUGS[policy])).toBe(policy);
    }
  });

  it("still resolves the pre-rename WCAG Strict slug", () => {
    expect(policyFromSlug("full-wcag")).toBe("wcag-strict");
  });

  it("never generates the legacy slug for a new link", () => {
    expect(Object.values(POLICY_SLUGS)).not.toContain("full-wcag");
  });

  it("falls back to the default for an unrecognised or missing slug", () => {
    expect(policyFromSlug("not-a-real-slug")).toBe(DEFAULT_POLICY);
    expect(policyFromSlug(null)).toBe(DEFAULT_POLICY);
  });
});
