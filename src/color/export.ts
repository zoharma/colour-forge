/** Rendering a draft as CSS custom properties, in the profile's own naming
 *  convention. Output only — nothing is written back to any file. */

import { chosenForeground, type Draft } from "./scale";
import { WCAG_CRITERION, permittedUsage } from "./wcag";
import { displayStep, type ModeKey, type Profile } from "../profiles/types";

const substitute = (template: string, intent: string): string => template.replaceAll("{intent}", intent);

/** Token names must survive being pasted into a stylesheet, so an intent
 *  name gets reduced to what is legal in a custom property ident. */
export function slugifyIntent(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "draft";
}

export interface ExportOptions {
  /** Foreground label chosen per mode and role, where the human overrode the
   *  tool's recommendation. */
  foregroundOverrides?: Partial<Record<ModeKey, Record<string, string>>>;
  /** Annotate each declaration with its measured APCA and WCAG values. */
  includeMeasurements?: boolean;
}

function blockFor(profile: Profile, draft: Draft, mode: ModeKey, options: ExportOptions): string {
  const intent = slugifyIntent(draft.name);
  const lines: string[] = [];

  for (const role of profile.roles) {
    const step = draft[mode].roles[role.key];
    if (!step) continue;

    // A deliberate miss is annotated whether or not measurements were asked
    // for: it is a decision someone made, and it has to survive the paste
    // into a token file rather than living only in this session's UI.
    const belowAa =
      step.conformance === "meets"
        ? ""
        : `  /* Below ${WCAG_CRITERION[step.requirement]} at ${step.wcagRatio.toFixed(2)}:1 — kept for hue.\n     Legal for ${permittedUsage(step.wcagRatio)}. Needs a non-colour cue. */\n`;
    const comment = options.includeMeasurements
      ? `  /* APCA Lc ${step.lc.toFixed(0)}, WCAG ${step.wcagRatio.toFixed(2)}:1 vs background */\n`
      : "";
    lines.push(...(belowAa ? [belowAa.trimEnd()] : []));
    lines.push(`${comment}  ${substitute(role.cssVar, intent)}: ${step.hex};`);

    if (role.needsForeground && role.foregroundCssVar) {
      const override = options.foregroundOverrides?.[mode]?.[role.key];
      const fg = chosenForeground(draft, mode, role.key, override);
      if (fg) {
        const fgComment = options.includeMeasurements
          ? `  /* APCA Lc ${fg.lc.toFixed(0)}, WCAG ${fg.wcagRatio.toFixed(2)}:1 vs ${substitute(role.cssVar, intent)} */\n`
          : "";
        lines.push(`${fgComment}  ${substitute(role.foregroundCssVar, intent)}: ${fg.hex};`);
      }
    }
  }

  return lines.join("\n");
}

/** The whole ramp as numbered tokens, not just the named roles.
 *
 *  The named roles are the opinionated part; the scale is the raw material.
 *  Exporting it lets the steps no role claims — a chart series, a hover
 *  state, a role that does not exist yet — be used without hand-copying hexes
 *  out of the UI, the way a design system's grey ramp gets used far beyond
 *  its few named neutrals. */
export function exportScaleCss(profile: Profile, draft: Draft, options: ExportOptions = {}): string {
  const intent = slugifyIntent(draft.name);
  const prefix = profile.roles[0]?.cssVar.startsWith("--ds-") ? "--ds" : "--color";

  const block = (mode: ModeKey) =>
    draft[mode].scale
      .map((step, i) => {
        const roles = profile.roles
          .filter((r) => draft[mode].roles[r.key]?.stepIndex === i)
          .map((r) => r.label);
        const note = options.includeMeasurements
          ? `  /* ${roles.length ? roles.join(", ") : "spare"} — APCA Lc ${step.lc.toFixed(0)}, WCAG ${step.wcagRatio.toFixed(2)}:1 */\n`
          : "";
        // Named `step-N`, deliberately not `N00`. This tool puts the Material
        // palette front and centre, and a `-500` token that means "step 5 of
        // 12" rather than "Material 500" is a trap laid for whoever reads the
        // file next.
        return `${note}  ${prefix}-${intent}-step-${displayStep(i)}: ${step.hex};`;
      })
      .join("\n");

  const header = profile.cssHeader ? `${profile.cssHeader}\n\n` : "";
  return (
    `${header}/* Full ${profile.scaleSize}-step scale: every step the solver produced,\n` +
    `   including the ones no role claims.\n\n` +
    `   Steps are numbered 1-${profile.scaleSize}. A step number is a position in the role\n` +
    `   ramp, NOT a fixed lightness. The\n` +
    `   two modes are solved independently, so step 0 is the palest tint in\n` +
    `   light and the deepest in dark — the same index carries the same role in\n` +
    `   both, which is the point, but they are not each other's inverse. */\n\n` +
    `/* light */\n${profile.modes.light.selector} {\n${block("light")}\n}\n\n` +
    `/* dark */\n${profile.modes.dark.selector} {\n${block("dark")}\n}\n`
  );
}

export function exportCss(profile: Profile, draft: Draft, options: ExportOptions = {}): string {
  const header = profile.cssHeader ? `${profile.cssHeader}\n\n` : "";
  const light = `${profile.modes.light.selector} {\n${blockFor(profile, draft, "light", options)}\n}`;
  const dark = `${profile.modes.dark.selector} {\n${blockFor(profile, draft, "dark", options)}\n}`;
  return `${header}/* light */\n${light}\n\n/* dark */\n${dark}\n`;
}

/** The same values as JSON, for feeding a token pipeline rather than a
 *  stylesheet. */
export function exportJson(profile: Profile, draft: Draft, options: ExportOptions = {}): string {
  const intent = slugifyIntent(draft.name);
  const forMode = (mode: ModeKey) => {
    const out: Record<
      string,
      {
        value: string;
        apcaLc: number;
        wcagRatio: number;
        verdict: string;
        requirement?: string;
        conformance?: string;
        permittedUsage?: string;
      }
    > = {};
    for (const role of profile.roles) {
      const step = draft[mode].roles[role.key];
      if (!step) continue;
      out[substitute(role.cssVar, intent)] = {
        value: step.hex,
        apcaLc: Number(step.lc.toFixed(1)),
        wcagRatio: Number(step.wcagRatio.toFixed(2)),
        verdict: step.verdict,
        requirement: step.requirement,
        conformance: step.conformance,
        permittedUsage: permittedUsage(step.wcagRatio),
      };
      if (role.needsForeground && role.foregroundCssVar) {
        const fg = chosenForeground(draft, mode, role.key, options.foregroundOverrides?.[mode]?.[role.key]);
        if (fg) {
          out[substitute(role.foregroundCssVar, intent)] = {
            value: fg.hex,
            apcaLc: Number(fg.lc.toFixed(1)),
            wcagRatio: Number(fg.wcagRatio.toFixed(2)),
            verdict: fg.meetsRequirement ? "meets-4.5" : "below-4.5",
          };
        }
      }
    }
    return out;
  };

  return JSON.stringify(
    {
      intent,
      profile: profile.id,
      seed: draft.seedHex,
      contrastPolicy: draft.policy,
      light: forMode("light"),
      dark: forMode("dark"),
    },
    null,
    2,
  );
}
