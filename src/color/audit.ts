/** Everything the tool has to say about a draft colour, as findings.
 *
 *  Deliberately a measuring tool and not an optimiser. A sweep that only
 *  maximises separation reliably breaks hue-family consistency and sibling
 *  parity — the trade-offs here are for a person to make, so each check
 *  reports what it found and why it matters rather than silently correcting. */

import { apcaYHex } from "./apca";
import { CVD_SEPARATION_COMFORTABLE, CVD_SEPARATION_FLOOR, worstCvdSeparation } from "./cvd";
import { hexToOklch, hueDelta } from "./oklch";
import { rgbDistanceHex } from "./srgb";
import { chosenForeground, type Draft } from "./scale";
import { WCAG_CRITERION, meetsWcag, permittedUsage, wcagRatioHex } from "./wcag";
import { separationFloorFor, separationSeverityFor, type ModeKey, type Profile, type SeededIntent } from "../profiles/types";

export type Severity = "blocker" | "warning" | "note";

export type FindingCategory = "contrast" | "cvd" | "family" | "visibility";

export interface Finding {
  id: string;
  severity: Severity;
  category: FindingCategory;
  mode?: ModeKey;
  role?: string;
  message: string;
  detail?: string;
}

export const SEVERITY_ORDER: Record<Severity, number> = { blocker: 0, warning: 1, note: 2 };

const MODES: ModeKey[] = ["light", "dark"];

/** Hues that converge on each other once dark and desaturated. Human hue
 *  discrimination is measurably worse through the reds and ambers, so two
 *  warm intents can sit 25° apart, pass every contrast and CVD check, and
 *  still both read as "dark rust" in a filled button. */
const WARM_WEDGE = { min: 0, max: 75 };
const WARM_PROXIMITY_FLOOR = 90;

const HUE_DRIFT_LIMIT = 15;
const CONTAINER_VISIBILITY_FLOOR = 0.015;

/* ---------------------------------------------------------------------- */

function contrastFindings(profile: Profile, draft: Draft): Finding[] {
  const findings: Finding[] = [];

  for (const mode of MODES) {
    for (const role of profile.roles) {
      const step = draft[mode].roles[role.key];
      if (!step) continue;

      // A deliberate miss is a different thing from a failure, and gets said
      // differently: the colour was kept on purpose, and what comes with that
      // is a narrower permitted usage plus an obligation to carry the meaning
      // some other way. Still a blocker — it is a decision that has to reach
      // whoever implements it, not a note to skim past.
      if (step.conformance === "below-by-choice") {
        findings.push({
          id: `contrast-below-aa-${mode}-${role.key}`,
          severity: "blocker",
          category: "contrast",
          mode,
          role: role.key,
          message: `${role.label} is deliberately below ${WCAG_CRITERION[role.requirement]} at ${step.wcagRatio.toFixed(2)}:1, to keep the hue.`,
          detail: `Legal for ${permittedUsage(step.wcagRatio)}. This hue could not both reach the criterion and stay recognisably itself, and the contrast policy was set to keep the colour. Ship it only with a non-colour cue — an icon, a label, a shape — carrying the same meaning, and keep it off small body text.`,
        });
      }

      if (step.verdict === "below-both") {
        findings.push({
          id: `contrast-fail-${mode}-${role.key}`,
          severity: "blocker",
          category: "contrast",
          mode,
          role: role.key,
          message: `${role.label} cannot meet ${WCAG_CRITERION[role.requirement]} at any lightness of this hue.`,
          detail: `Best reachable is ${step.wcagRatio.toFixed(2)}:1 (APCA Lc ${step.lc.toFixed(0)}), which is legal for ${permittedUsage(step.wcagRatio)}. This hue will not carry this role against the ${mode} background — change the hue, or use the role differently.`,
        });
      }

      if (step.verdict === "wcag-bound") {
        findings.push({
          id: `contrast-wcag-bound-${mode}-${role.key}`,
          severity: "note",
          category: "contrast",
          mode,
          role: role.key,
          message: `${role.label} is held at ${step.wcagRatio.toFixed(2)}:1 by WCAG 2.2, not by APCA.`,
          detail: `The colour would have kept more chroma at lower contrast, but that would drop it below ${WCAG_CRITERION[role.requirement]}. It is more washed out than APCA alone would make it, on purpose.`,
        });
      }

      if (step.verdict === "hue-protected") {
        findings.push({
          id: `contrast-hue-protected-${mode}-${role.key}`,
          severity: "note",
          category: "contrast",
          mode,
          role: role.key,
          message: `${role.label} eased off its APCA target (Lc ${step.targetLc} → ${Math.abs(step.lc).toFixed(0)}) to stay recognisably this colour.`,
          detail: `Reaching Lc ${step.targetLc} would have cost more than ${Math.round((1 - step.chromaRetention) * 100)}% of the hue's chroma. Still clears ${WCAG_CRITERION[role.requirement]} at ${step.wcagRatio.toFixed(2)}:1.`,
        });
      }

      // A surface role's own foreground is where contrast failures actually
      // reach a user, and it is not covered by the role's own solve.
      if (role.needsForeground) {
        const fg = chosenForeground(draft, mode, role.key);
        if (fg && !meetsWcag(fg.wcagRatio, "body")) {
          findings.push({
            id: `contrast-foreground-${mode}-${role.key}`,
            severity: "blocker",
            category: "contrast",
            mode,
            role: role.key,
            message: `No foreground on ${role.label} reaches 4.5:1 — best is ${fg.label} at ${fg.wcagRatio.toFixed(2)}:1.`,
            detail: `APCA Lc ${fg.lc.toFixed(0)}. Text on this surface would fail 1.4.3 AA. Adjust the surface's lightness or reserve it for large text only.`,
          });
        }
      }
    }
  }

  return findings;
}

/* ---------------------------------------------------------------------- */

export interface SeparationRow {
  mode: ModeKey;
  role: string;
  roleLabel: string;
  /** The floor this role is held to, which is not the same for every role. */
  floor: number;
  worst?: { a: string; b: string; value: number; type: string };
  underFloor: { a: string; b: string; value: number }[];
  count: number;
}

/** Every pair of intents that carry the same role, ranked by how close they
 *  get under the worst of the three simulated deficiencies. */
export function separationRows(profile: Profile, family: SeededIntent[]): SeparationRow[] {
  const rows: SeparationRow[] = [];

  for (const mode of MODES) {
    for (const roleKey of profile.separationRoles) {
      const role = profile.roles.find((r) => r.key === roleKey);
      const entries = family
        .map((f) => ({ name: f.name, hex: f[mode][roleKey] }))
        .filter((e): e is { name: string; hex: string } => Boolean(e.hex));

      const pairs: { a: string; b: string; value: number; type: string }[] = [];
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i] as { name: string; hex: string };
          const b = entries[j] as { name: string; hex: string };
          const sep = worstCvdSeparation(a.hex, b.hex);
          pairs.push({ a: a.name, b: b.name, value: sep.value, type: sep.type });
        }
      }
      pairs.sort((x, y) => x.value - y.value);
      const floor = role ? separationFloorFor(role) : CVD_SEPARATION_FLOOR;

      rows.push({
        mode,
        role: roleKey,
        roleLabel: role?.label ?? roleKey,
        floor,
        worst: pairs[0],
        underFloor: pairs.filter((p) => p.value < floor),
        count: entries.length,
      });
    }
  }

  return rows;
}

function cvdFindings(profile: Profile, family: SeededIntent[], draftName: string): Finding[] {
  const findings: Finding[] = [];

  for (const row of separationRows(profile, family)) {
    const role = profile.roles.find((r) => r.key === row.role);
    if (!role) continue;
    const severity = separationSeverityFor(role);
    const isWash = role.requirement === "none";

    // Only pairs involving the draft are actionable here — collisions between
    // two shipped intents are the existing palette's business, and are in the
    // separation table either way.
    const involvingDraft = row.underFloor.filter((p) => p.a === draftName || p.b === draftName);
    for (const pair of involvingDraft) {
      const other = pair.a === draftName ? pair.b : pair.a;
      findings.push({
        id: `cvd-${row.mode}-${row.role}-${other}`,
        severity,
        category: "cvd",
        mode: row.mode,
        role: row.role,
        message: isWash
          ? `${row.roleLabel} is all but identical to ${other}'s.`
          : `${row.roleLabel} is indistinguishable from ${other} under simulated colour-vision deficiency.`,
        detail: isWash
          ? `Separation ${pair.value.toFixed(1)} on the 0–441 RGB scale. Quiet tinted surfaces are expected to sit close together, so this is not a contrast failure — but at this distance the two are effectively the same wash, so nothing is gained by having both.`
          : `Separation ${pair.value.toFixed(1)} on the 0–441 RGB scale, below the ~${row.floor} floor where two colours stop being tellable apart. If these two ever appear together and colour is the only difference, that meaning is lost.`,
      });
    }

    // A meaning-bearing role that clears the floor but only just is worth a
    // word; a wash that does is not.
    if (!isWash && row.worst && !involvingDraft.length) {
      const involvesDraft = row.worst.a === draftName || row.worst.b === draftName;
      if (involvesDraft && row.worst.value < CVD_SEPARATION_COMFORTABLE) {
        const other = row.worst.a === draftName ? row.worst.b : row.worst.a;
        findings.push({
          id: `cvd-tight-${row.mode}-${row.role}-${other}`,
          severity: "warning",
          category: "cvd",
          mode: row.mode,
          role: row.role,
          message: `${row.roleLabel} sits close to ${other} under ${row.worst.type} (${row.worst.value.toFixed(1)}).`,
          detail: `Above the ${row.floor} floor but with little margin. Pair it with an icon or label rather than relying on colour alone.`,
        });
      }
    }
  }

  return findings;
}

/* ---------------------------------------------------------------------- */

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function familyFindings(profile: Profile, draft: Draft, siblings: SeededIntent[]): Finding[] {
  const findings: Finding[] = [];
  const seedHue = draft.seedOklch.H;

  for (const mode of MODES) {
    // Hue drift: gamut mapping can pull a step's hue off the seed's, and a
    // role that has drifted stops reading as part of the same family.
    for (const role of profile.roles) {
      const step = draft[mode].roles[role.key];
      if (!step) continue;
      const delta = hueDelta(seedHue, hexToOklch(step.hex).H);
      if (delta > HUE_DRIFT_LIMIT) {
        findings.push({
          id: `family-huedrift-${mode}-${role.key}`,
          severity: "warning",
          category: "family",
          mode,
          role: role.key,
          message: `${role.label}'s hue has drifted ${delta.toFixed(0)}° from the seed colour.`,
          detail: "Usually gamut clamping at an extreme lightness. Check it still reads as the same colour family.",
        });
      }
    }

    if (!siblings.length) continue;

    for (const roleKey of profile.separationRoles) {
      const role = profile.roles.find((r) => r.key === roleKey);
      const step = draft[mode].roles[roleKey];
      if (!step || !role) continue;

      const siblingLightness = siblings
        .map((f) => f[mode][roleKey])
        .filter((hex): hex is string => Boolean(hex))
        .map((hex) => hexToOklch(hex).L);
      if (!siblingLightness.length) continue;

      const meanL = mean(siblingLightness);
      const spread = Math.max(...siblingLightness) - Math.min(...siblingLightness);
      const draftL = hexToOklch(step.hex).L;
      if (Math.abs(draftL - meanL) > Math.max(0.06, spread)) {
        findings.push({
          id: `family-lightness-${mode}-${roleKey}`,
          severity: "warning",
          category: "family",
          mode,
          role: roleKey,
          message: `${role.label} sits outside the existing intents' lightness spread.`,
          detail: `Draft L ${draftL.toFixed(2)} against a sibling mean of ${meanL.toFixed(2)}. It will read as heavier or lighter than the rest of the set in the same component.`,
        });
      }

      const siblingChroma = siblings
        .map((f) => f[mode][roleKey])
        .filter((hex): hex is string => Boolean(hex))
        .map((hex) => hexToOklch(hex).C);
      const meanC = mean(siblingChroma);
      const draftC = hexToOklch(step.hex).C;
      if (meanC > 0 && (draftC > meanC * 1.8 || draftC < meanC * 0.4)) {
        findings.push({
          id: `family-chroma-${mode}-${roleKey}`,
          severity: "warning",
          category: "family",
          mode,
          role: roleKey,
          message: `${role.label}'s chroma diverges from its siblings'.`,
          detail: `Draft C ${draftC.toFixed(3)} against a sibling mean of ${meanC.toFixed(3)} — it may read as louder or flatter than the rest of the family.`,
        });
      }
    }

    // Warm-wedge proximity. A plain RGB-distance check on purpose: it is not
    // about deficiency, it is about ordinary hue discrimination being poor
    // through the reds and ambers, which the CVD and contrast checks above
    // have nothing to say about.
    const inWedge = (h: number) => h >= WARM_WEDGE.min && h <= WARM_WEDGE.max;
    for (const role of profile.roles) {
      const step = draft[mode].roles[role.key];
      if (!step || role.usage === "surface") continue;
      if (!inWedge(hexToOklch(step.hex).H)) continue;

      for (const sibling of siblings) {
        const siblingHex = sibling[mode][role.key];
        if (!siblingHex) continue;
        const siblingOklch = hexToOklch(siblingHex);
        if (!inWedge(siblingOklch.H)) continue;

        const distance = rgbDistanceHex(step.hex, siblingHex);
        if (distance < WARM_PROXIMITY_FLOOR) {
          findings.push({
            id: `family-warm-${mode}-${role.key}-${sibling.name}`,
            severity: "warning",
            category: "family",
            mode,
            role: role.key,
            message: `${role.label} looks close to ${sibling.name}'s to normal vision.`,
            detail: `RGB distance ${distance.toFixed(0)}/441, hues ${hueDelta(hexToOklch(step.hex).H, siblingOklch.H).toFixed(0)}° apart. Warm hues read as more similar than the hue gap suggests once they are dark or desaturated.`,
          });
        }
      }
    }
  }

  return findings;
}

/* ---------------------------------------------------------------------- */

function visibilityFindings(profile: Profile, draft: Draft): Finding[] {
  const findings: Finding[] = [];

  for (const mode of MODES) {
    const surface = profile.modes[mode].surface;
    const surfaceY = apcaYHex(surface);

    for (const role of profile.roles) {
      if (role.usage !== "surface") continue;
      const step = draft[mode].roles[role.key];
      if (!step) continue;

      const margin = Math.abs(apcaYHex(step.hex) - surfaceY);
      if (margin < CONTAINER_VISIBILITY_FLOOR) {
        findings.push({
          id: `visibility-${mode}-${role.key}`,
          severity: "warning",
          category: "visibility",
          mode,
          role: role.key,
          message: `${role.label} is nearly the same luminance as the surface it sits on.`,
          detail: `Luminance margin ${margin.toFixed(3)} against ${surface}, and its separation is carried almost entirely by chroma — which is exactly what a colour-vision deficiency removes. Give it a border, or move it.`,
        });
      }

      // Whether the surface reads as a distinct region is a 1.4.11 question
      // when the boundary carries meaning, so report the number either way.
      const ratio = wcagRatioHex(step.hex, surface);
      if (ratio < 1.2 && margin >= CONTAINER_VISIBILITY_FLOOR) {
        findings.push({
          id: `visibility-ratio-${mode}-${role.key}`,
          severity: "note",
          category: "visibility",
          mode,
          role: role.key,
          message: `${role.label} is ${ratio.toFixed(2)}:1 against the surface — visible, but not a boundary.`,
          detail: "Fine for a quiet fill. If the edge of this region has to be perceivable on its own, 1.4.11 wants 3:1 and this needs a border.",
        });
      }
    }
  }

  return findings;
}

/* ---------------------------------------------------------------------- */

export function auditDraft(profile: Profile, draft: Draft, family: SeededIntent[]): Finding[] {
  const siblings = family.filter((f) => f.name !== draft.name);
  return [
    ...contrastFindings(profile, draft),
    ...cvdFindings(profile, family, draft.name),
    ...familyFindings(profile, draft, siblings),
    ...visibilityFindings(profile, draft),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** The draft as a family entry, so it participates in the separation checks
 *  alongside the shipped intents. */
export function draftAsIntent(profile: Profile, draft: Draft): SeededIntent {
  const forMode = (mode: ModeKey): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const role of profile.roles) {
      const step = draft[mode].roles[role.key];
      if (step) out[role.key] = step.hex;
    }
    return out;
  };
  return { name: draft.name, light: forMode("light"), dark: forMode("dark") };
}
