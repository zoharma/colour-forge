import type { Profile } from "./types";

/** A design-system-agnostic role set.
 *
 *  Seven roles most token systems have some version of, named for how they
 *  are used rather than for any one library's vocabulary, laid out in the
 *  same broad zones Radix's scale uses — surface, container, solid, text —
 *  since that convention is now familiar enough to be worth matching.
 *
 *  The curve (`targetLc`, `chromaMultiplier`) is shared with every other
 *  profile: one scale, tuned once against a sweep of Material's 19 hues to
 *  keep any two steps from converging on the same colour. A profile's
 *  character comes from its token names and which step each role claims,
 *  never from a bespoke curve.
 *
 *  Most roles claim the same step in both modes. `container` and `solid`
 *  are the exception, carried over from Diamond's real, hand-tuned tokens:
 *  a large filled shape (`solid`) reads as itself from chroma alone and
 *  wants less luminance separation in dark mode, while the smaller,
 *  quieter role beside it needs more — so the two swap which one sits
 *  further out as the mode flips.
 *
 *  `text` is split into `textPrimary` and `textSecondary`, same as Carbon's
 *  real two weights: `textPrimary` answers to normal body text (4.5:1),
 *  `textSecondary` — captions, helper text — only has to clear the
 *  large-text threshold (3:1). Neither swaps between modes.
 *
 *  Unlike `mui.ts` or `carbon.ts`, this profile is not standing in for a
 *  shipped system: `seedPalette` is an evenly-spaced synthetic hue wheel
 *  (red, orange, yellow, green, blue, purple, pink, grey) rather than a
 *  system's real intents, and `family` is empty — there is nothing real to
 *  check a fully generic palette against. This is the starting point for
 *  work that is not yet tied to any particular design system. */
export const genericProfile: Profile = {
  id: "generic",
  name: "Generic (core colours)",
  description:
    "Six usage-named roles and a neutral CSS naming convention, seeded from a plain hue wheel rather than any shipped system. The starting point when you are not working in a system the tool already knows.",
  provenance:
    "Curves are a reasoned starting point — adjust the targets to match your own tokens. The seed palette is an evenly-spaced synthetic hue wheel, not drawn from any real product, so there is no comparison family: a fully generic colour has nothing real to check itself against.",
  scaleSize: 12,

  modes: {
    light: {
      background: "#fbfbfd",
      surface: "#ffffff",
      onSurface: "#16181d",
      targetLc: [3, 8, 16, 30, 45, 58, 66, 75, 85, 90, 94, 98],
      chromaMultiplier: [0.12, 0.24, 0.4, 0.6, 1.0, 1.15, 1.1, 1.0, 0.9, 0.8, 0.68, 0.55],
      selector: ':root, [data-theme="light"]',
    },
    dark: {
      background: "#0b0d12",
      surface: "#14161d",
      onSurface: "#e8eaf0",
      targetLc: [3, 8, 15, 24, 34, 48, 62, 74, 84, 90, 94, 98],
      chromaMultiplier: [0.3, 0.55, 0.78, 0.95, 1.2, 1.1, 1.0, 0.85, 0.75, 0.65, 0.55, 0.45],
      selector: '[data-theme="dark"]',
    },
  },

  roles: [
    {
      key: "surfaceSubtle",
      label: "Surface subtle",
      index: { light: 0, dark: 0 },
      usage: "surface",
      requirement: "none",
      cssVar: "--color-{intent}-surface-subtle",
      description: "The quietest tinted background for this colour.",
    },
    {
      key: "surface",
      label: "Surface",
      index: { light: 1, dark: 1 },
      usage: "surface",
      requirement: "none",
      needsForeground: true,
      cssVar: "--color-{intent}-surface",
      foregroundCssVar: "--color-{intent}-on-surface",
      description: "Tinted background for banners, chips and quiet callouts.",
    },
    {
      key: "surfaceStrong",
      label: "Surface strong",
      index: { light: 2, dark: 2 },
      usage: "surface",
      requirement: "none",
      cssVar: "--color-{intent}-surface-strong",
      description: "Hover or raised state of the tinted surface.",
    },
    {
      key: "container",
      label: "Container",
      index: { light: 4, dark: 7 },
      usage: "surface",
      requirement: "none",
      cssVar: "--color-{intent}-container",
      description:
        "Tinted component background between the page surface and the solid fill — hover states, secondary buttons, chip backgrounds.",
    },
    {
      key: "solid",
      label: "Solid",
      index: { light: 6, dark: 4 },
      usage: "surface",
      requirement: "non-text",
      needsForeground: true,
      cssVar: "--color-{intent}-solid",
      foregroundCssVar: "--color-{intent}-on-solid",
      description: "Solid interactive surface: primary buttons, filled badges. Answers to 1.4.11 at 3:1.",
    },
    {
      key: "textSecondary",
      label: "Text secondary",
      index: { light: 8, dark: 8 },
      usage: "text",
      requirement: "large",
      cssVar: "--color-{intent}-text-secondary",
      description: "Muted coloured text — captions, helper text. Answers to 1.4.3 at 3:1 (large-text threshold).",
    },
    {
      key: "textPrimary",
      label: "Text primary",
      index: { light: 9, dark: 9 },
      usage: "text",
      requirement: "body",
      cssVar: "--color-{intent}-text-primary",
      description: "Coloured text and icons on the page background. Answers to 1.4.3 at 4.5:1.",
    },
  ],

  separationRoles: ["surface", "solid", "textPrimary"],

  cssHeader: "/* Generated by Colour Forge. Review before committing. */",

  /** An evenly-spaced hue wheel at a consistent chroma/lightness, not any
   *  vendor's palette — the point of this profile is to owe nothing to a
   *  specific system. Yellow sits a touch lighter than the rest; at the same
   *  lightness as the others it reads as olive rather than yellow. */
  seedPaletteLabel: "Core colours",
  seedPalette: [
    { name: "Red", hex: "#cf1717" },
    { name: "Orange", hex: "#cf6d17" },
    { name: "Yellow", hex: "#e6bd19" },
    { name: "Green", hex: "#17cf54" },
    { name: "Blue", hex: "#175dcf" },
    { name: "Purple", hex: "#6317cf" },
    { name: "Pink", hex: "#cf1773" },
    { name: "Grey", hex: "#78787d" },
  ],

  family: [],
};
