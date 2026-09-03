/** WCAG 2.1/2.2 contrast ratios and the thresholds that actually gate an
 *  audit. This exists alongside APCA rather than under it: APCA models
 *  perception better, but WCAG 2.2 is what a conformance report is written
 *  against, so a colour that reads well and fails 1.4.3 is still a finding. */

import { hexToLinear, type Rgb } from "./srgb";

export const wcagLuminance = (lin: Rgb): number => 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;

export const wcagLuminanceHex = (hex: string): number => wcagLuminance(hexToLinear(hex));

export function wcagRatioFromLuminance(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function wcagRatioHex(hexA: string, hexB: string): number {
  return wcagRatioFromLuminance(wcagLuminanceHex(hexA), wcagLuminanceHex(hexB));
}

/** What a role is required to clear, by how it gets used.
 *  - `body`      1.4.3 Contrast (Minimum), normal-size text — 4.5:1
 *  - `large`     1.4.3, text ≥18.66px bold or ≥24px — 3:1
 *  - `non-text`  1.4.11 Non-text Contrast: UI component boundaries,
 *                focus indicators, meaningful graphics — 3:1
 *  - `enhanced`  1.4.6 AAA normal-size text — 7:1
 *  - `none`      a decorative surface with no contrast requirement of its
 *                own; its paired foreground carries the requirement instead */
export type WcagRequirement = "body" | "large" | "non-text" | "enhanced" | "none";

export const WCAG_MINIMUM: Record<WcagRequirement, number> = {
  body: 4.5,
  large: 3,
  "non-text": 3,
  enhanced: 7,
  none: 0,
};

/** The success criterion each requirement answers to, for report copy. */
export const WCAG_CRITERION: Record<WcagRequirement, string> = {
  body: "1.4.3 AA (normal text)",
  large: "1.4.3 AA (large text)",
  "non-text": "1.4.11 AA (non-text)",
  enhanced: "1.4.6 AAA (normal text)",
  none: "no contrast requirement",
};

export function meetsWcag(ratio: number, requirement: WcagRequirement): boolean {
  return ratio + 1e-9 >= WCAG_MINIMUM[requirement];
}

/** Highest standard level a ratio clears, for display next to the number. */
export function wcagLevel(ratio: number): "AAA" | "AA" | "AA Large" | "fail" {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "fail";
}

/** The next standard level down from a requirement.
 *
 *  There is a real ladder here, not just "pass or fail": text that cannot
 *  reach 4.5:1 is still conformant at 3:1 if it is set large (≥18.66px bold
 *  or ≥24px), and a graphic that cannot reach 3:1 is conformant if it is
 *  decorative and carries no meaning on its own. Stepping down is therefore
 *  a design decision with a named consequence, which is very different from
 *  simply missing the bar. */
export function oneLevelDown(requirement: WcagRequirement): WcagRequirement {
  switch (requirement) {
    case "enhanced":
      return "body";
    case "body":
      return "large";
    case "large":
    case "non-text":
      return "none";
    case "none":
      return "none";
  }
}

/** What a given ratio is actually legal for, said plainly. This is the honest
 *  reading of a colour that misses AA: not "broken", but "narrower than you
 *  probably intended, and here is the obligation that comes with it". */
export function permittedUsage(ratio: number): string {
  if (ratio >= 7) return "any text, including AAA";
  if (ratio >= 4.5) return "body text and anything below it";
  if (ratio >= 3) return "large text (≥18.66px bold or ≥24px) and non-text elements";
  return "decoration only — it must not be the sole carrier of meaning";
}
