import { BASELINE_BACKGROUND, type Profile } from "./types";

/** Material Design 3 (Material You).
 *
 *  M3's colour system is genuinely different from M2/MUI: instead of a fixed
 *  hue palette, any source colour is run through the HCT tonal-palette
 *  algorithm, and every key colour — primary, secondary, tertiary, error —
 *  gets a real, named set of roles. That is literally `@material/web`'s own
 *  token set — it emits `--md-sys-color-{token}` custom properties — so the
 *  roles below map onto real M3 tokens rather than inventing names for the
 *  same shapes:
 *
 *  - `base` / `on-{intent}` — the key colour itself (Base / On Base).
 *  - `container` / `on-{intent}-container` — a softer tonal container
 *    (Container / On Container).
 *  - `baseDim` / `on-{intent}-fixed-variant` — M3's "fixed" family: a tone
 *    Google's spec keeps constant across light and dark theme (used for
 *    things like an avatar ring that shouldn't flip with the mode), paired
 *    with its softer text weight (Base Dim / On Base Dim, which the picker
 *    labels the same way it labels every role's foreground — "On {role}").
 *    This tool solves every role fresh per mode from that mode's own curve,
 *    so it cannot reproduce a literally identical hex across modes the way
 *    real M3 does. Its real M3 token names (`{intent}-fixed-dim`,
 *    `on-{intent}-fixed-variant`) are kept for `cssVar` even though the role
 *    itself is renamed for display, same as every other profile: the CSS
 *    output is the real system's vocabulary, the on-screen label is this
 *    tool's own, consistent legend.
 *
 *  Index choices below are fitted, not just reasoned about: each was checked
 *  against `@material/web`'s own light/dark values for all four baseline key
 *  colours (Primary #6750a4, Secondary #625b71, Tertiary #7d5260, Error
 *  #b3261e) by generating this profile's 12-step scale from each and finding
 *  the closest real RGB match, the same way a shipped reference swatch sheet
 *  would be checked against.
 *
 *  `container` sits at index 1 in light, 2 in dark — close to the palest end
 *  in both, since its real gap from the page background stays small in both
 *  modes (tone 90 against tone-98 light, tone 30 against tone-6 dark) and
 *  far smaller than `base`'s gap in either. Unlike Diamond's
 *  `container`/`solid`, it does not swap toward the far end in dark mode,
 *  because M3's real tone gaps don't invert that way.
 *
 *  `base` sits at index 7 in both modes: real M3 keeps its key colours
 *  prominent against the page in *both* modes on purpose (tone 40 against
 *  tone-98 in light, tone 80 against tone-6 in dark — both gaps read as
 *  strongly separated), so this role doesn't swap either.
 *
 *  `baseDim` sits at index 3 in both modes, just past `container` — fitted
 *  to light theme's `primary-fixed-dim` (tone 80), which sits much closer to
 *  `primary-container` (tone 90) than to `primary` (tone 40). Dark theme's
 *  own `primary-fixed-dim` happens to be identical to dark theme's `primary`
 *  (both tone 80) — a real fact about M3's baseline scheme, not something
 *  this profile models structurally: `baseDim` keeps one index across both
 *  modes, same as `base` and `container`, rather than jumping to `base`'s
 *  position in dark mode just because this one hue coincides with it.
 *
 *  `surface` and `onSurface` are the real neutral values from M3's baseline
 *  scheme (`surface-container`/`neutral10` light, `surface-container`/
 *  `neutral90` dark); `background` is the tool's shared solving baseline
 *  (`BASELINE_BACKGROUND`), not M3's own `neutral98`/`neutral6` page colour.
 *  `seedPalette` and
 *  `family` are M3's own baseline key colours and their shipped role
 *  values — not Material 500, which is M2's palette, not M3's — read from
 *  `@material/web`'s reference palette (source colour #6750a4). M3 does not
 *  define fixed roles for `error`, so that entry in `family` leaves
 *  `baseDim` absent rather than guessed.
 *
 *  Curves are shared with every other profile, tuned once against a sweep of
 *  Material's 19 hues. */
export const material3Profile: Profile = {
  id: "material3",
  name: "Material Design 3 (M3)",
  description:
    "M3's own colour-role shape — Base, Container, Base Dim — and --md-sys-color-* naming, seeded from M3's baseline key colours and checked against their shipped role values.",
  provenance:
    "Role names follow M3's own shapes (base -> {intent}, container -> {intent}-container, baseDim -> {intent}-fixed-dim). surface/onSurface, seedPalette and family below are the real values from @material/web's baseline reference palette (source colour #6750a4); background is the tool's shared solving baseline, not M3's own page colour.",
  scaleSize: 12,

  /** M3's own foreground pairings are exact, tone-specific values (on-primary
   *  IS primary100/primary20, not "whichever legible option") — "Theme text"
   *  and "Tinted" are this tool's own generic fallbacks for systems that
   *  don't define one, which M3 does. White/Black/On-{role} already cover
   *  what M3 actually ships. */
  excludeForegroundCandidates: ["themeText", "tinted"],

  modes: {
    light: {
      background: BASELINE_BACKGROUND.light,
      surface: "#f3edf7",
      onSurface: "#1d1b20",
      targetLc: [3, 8, 16, 30, 45, 58, 66, 75, 85, 90, 94, 98],
      chromaMultiplier: [0.12, 0.24, 0.4, 0.6, 1.0, 1.15, 1.1, 1.0, 0.9, 0.8, 0.68, 0.55],
      selector: ':root, [data-md-theme="light"]',
    },
    dark: {
      background: BASELINE_BACKGROUND.dark,
      surface: "#211f26",
      onSurface: "#e6e0e9",
      targetLc: [3, 8, 15, 24, 34, 48, 62, 74, 84, 90, 94, 98],
      chromaMultiplier: [0.3, 0.55, 0.78, 0.95, 1.2, 1.1, 1.0, 0.85, 0.75, 0.65, 0.55, 0.45],
      selector: '[data-md-theme="dark"]',
    },
  },

  roles: [
    {
      key: "container",
      label: "Container",
      index: { light: 1, dark: 2 },
      usage: "surface",
      requirement: "none",
      needsForeground: true,
      cssVar: "--md-sys-color-{intent}-container",
      foregroundCssVar: "--md-sys-color-on-{intent}-container",
      description: "Tonal container: filled cards, tonal buttons, chip backgrounds.",
    },
    {
      key: "baseDim",
      label: "Base Dim",
      index: { light: 3, dark: 3 },
      usage: "surface",
      requirement: "none",
      needsForeground: true,
      cssVar: "--md-sys-color-{intent}-fixed-dim",
      foregroundCssVar: "--md-sys-color-on-{intent}-fixed-variant",
      shareForegroundWith: "base",
      tintedLabel: "On Base Variant",
      description: "M3's theme-invariant tone: avatar rings, persistent selection state.",
    },
    {
      key: "base",
      label: "Base",
      index: { light: 7, dark: 7 },
      usage: "surface",
      requirement: "non-text",
      needsForeground: true,
      cssVar: "--md-sys-color-{intent}",
      foregroundCssVar: "--md-sys-color-on-{intent}",
      // Real M3 has no on-{intent}-variant paired with `base` itself — only
      // with the fixed family (`baseDim`). It's offered here too on purpose:
      // `base` and `baseDim` are the same real tone in dark mode (see the
      // file docstring), so the same variant text genuinely belongs on both.
      tintedLabel: "On Base Variant",
      description: "The key colour itself: FABs, filled buttons, active icons. Answers to 1.4.11 at 3:1.",
    },
  ],

  separationRoles: ["container", "base", "baseDim"],

  cssHeader: "/* Generated by Colour Forge. Review before committing. */",

  /** M3's own baseline key colours at their light-theme tone — primary,
   *  secondary, tertiary and error — rather than Material 500, which is
   *  M2's palette. Values quoted from @material/web's reference palette,
   *  source colour #6750a4. */
  scaleCssPrefix: "--md-sys-color",

  seedPaletteLabel: "M3 baseline key colours",
  seedPalette: [
    { name: "Primary", hex: "#6750a4" },
    { name: "Secondary", hex: "#625b71" },
    { name: "Tertiary", hex: "#7d5260" },
    { name: "Error", hex: "#b3261e" },
  ],

  /** M3's baseline scheme, quoted from @material/web's reference palette.
   *  `baseDim` is the same value in both modes — that is the entire point
   *  of M3's "fixed" family — which this tool's per-mode solver cannot
   *  reproduce exactly (see the file docstring); the real, shipped value is
   *  quoted here regardless, same as any other family entry. M3 defines no
   *  fixed roles for `error`, so that key is absent for it rather than
   *  guessed. */
  family: [
    {
      name: "primary",
      light: { base: "#6750a4", container: "#eaddff", baseDim: "#d0bcff" },
      dark: { base: "#d0bcff", container: "#4f378b", baseDim: "#d0bcff" },
    },
    {
      name: "secondary",
      light: { base: "#625b71", container: "#e8def8", baseDim: "#ccc2dc" },
      dark: { base: "#ccc2dc", container: "#4a4458", baseDim: "#ccc2dc" },
    },
    {
      name: "tertiary",
      light: { base: "#7d5260", container: "#ffd8e4", baseDim: "#efb8c8" },
      dark: { base: "#efb8c8", container: "#633b48", baseDim: "#efb8c8" },
    },
    {
      name: "error",
      light: { base: "#b3261e", container: "#f9dedc" },
      dark: { base: "#f2b8b5", container: "#8c1d18" },
    },
  ],
};
