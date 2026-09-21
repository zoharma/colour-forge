/** Programmatic entry point: build a draft (and optionally audit it) from a
 *  seed colour without going through the UI. Prints one JSON object to
 *  stdout, in the same shape as the "Export JSON" panel.
 *
 *  Usage: npm run generate -- --seed "#3366ff" [--profile mui]
 *         [--policy wcag-relaxed] [--name "New intent"] [--audit] */

import { findProfile, DEFAULT_PROFILE_ID, PROFILES } from "../src/profiles";
import { isValidHex, normaliseHex } from "../src/color/srgb";
import { buildDraft } from "../src/color/scale";
import { auditDraft, draftAsIntent } from "../src/color/audit";
import { exportJson } from "../src/color/export";
import { DEFAULT_CONTRAST_POLICY, type ContrastPolicy } from "../src/color/solver";

const CONTRAST_POLICIES: ContrastPolicy[] = ["wcag-relaxed", "hue-first", "wcag-strict"];

function isContrastPolicy(value: string): value is ContrastPolicy {
  return (CONTRAST_POLICIES as string[]).includes(value);
}

function fail(message: string): never {
  console.error(`generate: ${message}`);
  process.exit(1);
}

interface Args {
  seed: string;
  profileId: string;
  policy: ContrastPolicy;
  name: string;
  audit: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const seed = get("--seed");
  if (!seed) fail("--seed <hex> is required");
  if (!isValidHex(seed)) fail(`"${seed}" is not a valid hex colour`);

  const profileId = get("--profile") ?? DEFAULT_PROFILE_ID;
  if (!PROFILES.some((p) => p.id === profileId)) {
    fail(`Unknown profile "${profileId}". Known: ${PROFILES.map((p) => p.id).join(", ")}`);
  }

  const policyInput = get("--policy") ?? DEFAULT_CONTRAST_POLICY;
  if (!isContrastPolicy(policyInput)) {
    fail(`Unknown policy "${policyInput}". Expected one of: ${CONTRAST_POLICIES.join(", ")}`);
  }

  return {
    seed: normaliseHex(seed),
    profileId,
    policy: policyInput,
    name: get("--name") ?? seed,
    audit: argv.includes("--audit"),
  };
}

const args = parseArgs(process.argv.slice(2));
const profile = findProfile(args.profileId);
const draft = buildDraft(profile, args.name, args.seed, args.policy);

const result: Record<string, unknown> = JSON.parse(exportJson(profile, draft));
if (args.audit) {
  result.findings = auditDraft(profile, draft, [...profile.family, draftAsIntent(profile, draft)]);
}

console.log(JSON.stringify(result, null, 2));
