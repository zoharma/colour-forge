/** Rendering a draft as CSS custom properties, in the profile's own naming
 *  convention. Output only — nothing is written back to any file. */

import { chosenForeground, type Draft } from "./scale";
import type { ModeKey, Profile } from "../profiles/types";

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

    const comment = options.includeMeasurements
      ? `  /* APCA Lc ${step.lc.toFixed(0)}, WCAG ${step.wcagRatio.toFixed(2)}:1 vs background */\n`
      : "";
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
    const out: Record<string, { value: string; apcaLc: number; wcagRatio: number; verdict: string }> = {};
    for (const role of profile.roles) {
      const step = draft[mode].roles[role.key];
      if (!step) continue;
      out[substitute(role.cssVar, intent)] = {
        value: step.hex,
        apcaLc: Number(step.lc.toFixed(1)),
        wcagRatio: Number(step.wcagRatio.toFixed(2)),
        verdict: step.verdict,
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
    { intent, profile: profile.id, seed: draft.seedHex, light: forMode("light"), dark: forMode("dark") },
    null,
    2,
  );
}
