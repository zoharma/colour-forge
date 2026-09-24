import { BASELINE_BACKGROUND, type Profile } from "./types";

/** IBM Carbon Design System.
 *
 *  Role names follow Carbon's own Layer group — `background`, `layer`,
 *  `layer-accent` — plus `border` and the two weights of `text` Carbon ships
 *  (`text-primary`, `text-secondary`). Carbon's real versions of these are
 *  neutral elevation tokens (the app shell's stacking order), not per-colour
 *  ones — there is no shipped "layer-accent, but red" — so this profile
 *  reuses the vocabulary for a tinted per-intent equivalent rather than
 *  claiming these particular values are shipped. `surface` (Carbon's real
 *  `layer-01`) and `onSurface` (Carbon's real `text-primary`) below *are*
 *  the genuine neutral values; `background` is the tool's shared solving
 *  baseline (`BASELINE_BACKGROUND`), not Carbon's own page colour — only the
 *  six per-intent roles are this tool's own extrapolation onto Carbon's
 *  naming.
 *
 *  `layerAccent` sits at the step this tool's other profiles call `solid` —
 *  the vivid, identity-carrying, needs-a-foreground fill — since it is the
 *  one real per-colour precedent Carbon ships (`interactive`, `support-*`).
 *  `border` sits at the quieter step they call `container`, mirroring
 *  Diamond's own `accent` role (same index, same boundary/non-text shape).
 *  `background` and `layer` stay at the two quietest, non-swapping steps,
 *  same as `surfaceSubtle`/`surface` elsewhere. `textPrimary` does not swap
 *  between modes, same as every other profile's text/base role; `textSecondary`
 *  sits one step quieter and only has to clear the large-text threshold,
 *  since Carbon's own text-secondary is the softer of the two weights.
 *
 *  `layerAccent` and `border` swap which end of the scale they sit toward as
 *  the mode flips, same reasoning as `container`/`solid` elsewhere: a
 *  pigment that reads as itself from chroma alone needs less luminance
 *  separation from a dark page than a quiet wash does.
 *
 *  `seedPalette` pulls one representative step from each of Carbon's own
 *  10-step hue scales (`@carbon/colors`), the same job Material's 500s do
 *  for `mui`. Most hues use step 60, the shade Carbon's own docs treat as
 *  each hue's identity; Yellow and Orange sit lighter (30 and 40) because
 *  their 60s read as brown rather than as the hue.
 *
 *  `family` holds Carbon's real semantic tokens — `interactive` and the four
 *  `support-*` colours (error, success, warning, info) — read from
 *  `@carbon/themes`' White and g100 themes. Carbon ships these as single flat
 *  colours, not a scale, so only `layerAccent` has a real value for each;
 *  the other roles are absent rather than guessed.
 *
 *  Curves are shared with `generic` and `mui`, tuned once against a sweep of
 *  Material's 19 hues — Carbon's backgrounds are close enough that re-tuning
 *  from scratch would just rediscover the same numbers. */
export const carbonProfile: Profile = {
  id: "carbon",
  name: "IBM Carbon Design System",
  description:
    "Carbon's own Layer/Border/Text token names — background, layer, layer-accent, border, text-primary, text-secondary — seeded from Carbon's colour scales and checked against its shipped interactive and support (error/success/warning/info) colours.",
  provenance:
    "Role names follow Carbon's own token groups (Layer, Border, Text); the six per-intent roles are this tool's extrapolation onto that naming, since Carbon's real versions are neutral elevation tokens. surface/onSurface, seedPalette and family below are the real values from @carbon/themes (White, g100) and @carbon/colors v11; background is the tool's shared solving baseline, not Carbon's own page colour.",
  scaleSize: 12,

  /** Carbon's own text-on-colour pairings are exact, defined values (its Tag
   *  and Notification components ship a specific text colour per type, not
   *  "whichever legible option") — "Theme text" and "Tinted" are this tool's
   *  own generic fallbacks for systems that don't define one, which Carbon
   *  does. White/Black/On-{role} already cover what Carbon actually ships. */
  excludeForegroundCandidates: ["themeText", "tinted"],

  modes: {
    light: {
      background: BASELINE_BACKGROUND.light,
      surface: "#f4f4f4",
      onSurface: "#161616",
      targetLc: [3, 8, 16, 30, 45, 58, 66, 75, 85, 90, 94, 98],
      chromaMultiplier: [0.12, 0.24, 0.4, 0.6, 1.0, 1.15, 1.1, 1.0, 0.9, 0.8, 0.68, 0.55],
      selector: ':root, [data-carbon-theme="white"]',
    },
    dark: {
      background: BASELINE_BACKGROUND.dark,
      surface: "#262626",
      onSurface: "#f4f4f4",
      targetLc: [3, 8, 15, 24, 34, 48, 62, 74, 84, 90, 94, 98],
      chromaMultiplier: [0.3, 0.55, 0.78, 0.95, 1.2, 1.1, 1.0, 0.85, 0.75, 0.65, 0.55, 0.45],
      selector: '[data-carbon-theme="g100"]',
    },
  },

  roles: [
    {
      key: "background",
      label: "Background",
      index: { light: 0, dark: 0 },
      usage: "surface",
      requirement: "none",
      cssVar: "--cds-background-{intent}",
      description: "The quietest tinted background for this colour.",
    },
    {
      key: "layer",
      label: "Layer",
      index: { light: 1, dark: 1 },
      usage: "surface",
      requirement: "none",
      needsForeground: true,
      cssVar: "--cds-layer-{intent}",
      foregroundCssVar: "--cds-on-{intent}-layer",
      description: "Tinted panel background: banners, quiet callouts.",
    },
    {
      key: "border",
      label: "Border",
      index: { light: 4, dark: 7 },
      usage: "boundary",
      requirement: "non-text",
      cssVar: "--cds-border-{intent}",
      description: "Dividers, rules and borders in this colour. Answers to 1.4.11 at 3:1.",
    },
    {
      key: "layerAccent",
      label: "Layer accent",
      index: { light: 6, dark: 4 },
      usage: "surface",
      requirement: "non-text",
      needsForeground: true,
      cssVar: "--cds-layer-accent-{intent}",
      foregroundCssVar: "--cds-on-{intent}-layer-accent",
      description:
        "The vivid, identity-carrying fill: primary buttons, status badges, filled tags. Answers to 1.4.11 at 3:1.",
    },
    {
      key: "textPrimary",
      label: "Text primary",
      index: { light: 9, dark: 9 },
      usage: "text",
      requirement: "body",
      cssVar: "--cds-text-primary-{intent}",
      description: "Coloured text and icons on the page background. Answers to 1.4.3 at 4.5:1.",
    },
    {
      key: "textSecondary",
      label: "Text secondary",
      index: { light: 8, dark: 8 },
      usage: "text",
      requirement: "large",
      cssVar: "--cds-text-secondary-{intent}",
      description: "Muted coloured text — captions, helper text. Answers to 1.4.3 at 3:1 (large-text threshold).",
    },
  ],

  separationRoles: ["layer", "layerAccent", "border", "textPrimary"],

  cssHeader: "/* Generated by Colour Forge. Review before committing. */",

  /** Step 60 from each of Carbon's chromatic and grey scales — the shade
   *  Carbon's own documentation treats as each hue's identity colour — except
   *  Yellow (30) and Orange (40), whose 60s read as brown rather than as the
   *  hue. Values quoted from `@carbon/colors` v11. */
  scaleCssPrefix: "--cds",

  seedPaletteLabel: "Carbon colour scales",
  seedPalette: [
    { name: "Red", hex: "#da1e28" },
    { name: "Magenta", hex: "#d02670" },
    { name: "Purple", hex: "#8a3ffc" },
    { name: "Blue", hex: "#0f62fe" },
    { name: "Cyan", hex: "#0072c3" },
    { name: "Teal", hex: "#007d79" },
    { name: "Green", hex: "#198038" },
    { name: "Yellow", hex: "#f1c21b" },
    { name: "Orange", hex: "#ff832b" },
    { name: "Gray", hex: "#6f6f6f" },
    { name: "Cool Gray", hex: "#697077" },
    { name: "Warm Gray", hex: "#726e6e" },
  ],

  /** Carbon's real semantic tokens, quoted from `@carbon/themes`' White and
   *  g100 themes. `interactive` stands in for a primary intent; the other
   *  four are Carbon's own `support-*` names. Carbon ships each as one flat
   *  colour rather than a scale, so only `layerAccent` is populated — the
   *  rest are absent rather than guessed. `warning` is identical in both
   *  themes: Carbon does not lighten or darken it for the dark theme. */
  family: [
    { name: "interactive", light: { layerAccent: "#0f62fe" }, dark: { layerAccent: "#4589ff" } },
    { name: "error", light: { layerAccent: "#da1e28" }, dark: { layerAccent: "#fa4d56" } },
    { name: "success", light: { layerAccent: "#24a148" }, dark: { layerAccent: "#42be65" } },
    { name: "warning", light: { layerAccent: "#f1c21b" }, dark: { layerAccent: "#f1c21b" } },
    { name: "info", light: { layerAccent: "#0043ce" }, dark: { layerAccent: "#4589ff" } },
  ],
};
