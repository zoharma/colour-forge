# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [0.5.1] - 2026-09-16

### Changed

- Layout pass for readability and first-time use: slightly larger type
  throughout, a wider page on large screens, numbered sections (1 Input,
  2 Cross-check, 3 Verdict, 4 Output), and power-user detail — seed
  pinning, raw OKLCH values, profile provenance, the full contrast-model
  rationale, and the pairwise separation table — moved into collapsed
  "Advanced" disclosures. No behaviour or calculation changed.

## [0.5.0] - 2026-09-15

### Added

- Anomalous trichromacy views in the colour-vision simulator: Protanomaly,
  Deuteranomaly, Tritanomaly and Achromatomaly.
- The seed colour picker also sits in the pinned header now, next to the
  title.

### Changed

- Colour-vision picker: "Normal" relabelled "Regular Vision", anomalies
  now listed before their full counterpart, and header order swapped to
  colour-vision picker before theme picker.

## [0.4.0] - 2026-09-11

### Added

- MUI / Material Design 2 profile: MUI's own `light`/`main`/`dark`/
  `contrastText` shape and `--mui-palette-*` naming, seeded from Material 500
  and checked against MUI's own default intents.
- Material Design 3 (M3) profile: `base`/`container`/`baseDim` roles and
  `--md-sys-color-*` naming, with every index fitted against
  `@material/web`'s real light/dark values for its four baseline key
  colours rather than just reasoned about.
- IBM Carbon Design System profile: `background`/`layer`/`layerAccent`/
  `border`/`textPrimary`/`textSecondary` roles and `--cds-*` naming, seeded
  from Carbon's own colour scales and checked against its shipped
  interactive/support colours.
- `excludeForegroundCandidates` and `shareForegroundWith`/`tintedLabel`
  profile and role fields, letting a profile trim the generic foreground
  picker's fallbacks (a system with exact, defined pairings has no use for
  "Theme text" or "Tinted") or have two closely related roles share one
  computed foreground instead of each solving a slightly different one.

### Changed

- **Breaking (CSS export):** Generic's `text` role is split into
  `textPrimary`/`textSecondary` (4.5:1 body text and a softer 3:1
  large-text weight), same as Carbon. `--color-{intent}-text` →
  `--color-{intent}-text-primary`.
- Generic's seed palette is now an evenly-spaced synthetic hue wheel rather
  than Material 500, and its comparison family is empty — that job moved to
  the new MUI profile, which keeps the old MUI-derived seed/family.

### Fixed

- `exportScaleCss`'s "Full scale" export used the `--color` prefix for
  every profile but Diamond, instead of each profile's own
  (`--mui-palette`, `--md-sys-color`, `--cds`) — every profile now declares
  its prefix explicitly rather than having it inferred from one role.
- The live preview's coloured-text swatch picked whichever `text`-usage
  role came first in a profile's role array, which was the muted
  `textSecondary` for Generic and Carbon instead of the primary one.
- A `shareForegroundWith` role's borrowed foreground candidate solved in
  the wrong light/dark direction: only the shared surface's colour was
  substituted, not its light/dark classification.

## [0.3.0] - 2026-09-10

### Changed

- Contrast policy defaults to **System default**, a real one-level
  compromise between APCA and WCAG 2.2, rather than holding full WCAG 2.2.
- **Breaking (CSS export):** Generic's `border`/`fill` roles are renamed to
  `container`/`solid`, following Radix's surface → container → solid → text
  convention. `--color-{intent}-border` → `--color-{intent}-container`;
  `--color-{intent}-fill`/`-on-fill` → `--color-{intent}-solid`/`-on-solid`.
  `container`'s own WCAG requirement drops from non-text 3:1 to none — it is
  now a tinted surface, not a boundary.
- Diamond shares Generic's `targetLc`/`chromaMultiplier` curve instead of
  its own fitted one. Only which step each role claims still varies by
  profile; `accent`/`solid` keep disagreeing about their step between light
  and dark, carried over from Diamond's real, hand-tuned tokens.
- The contrast-policy URL parameter now uses the same names as the policy
  tabs (`more-apca`, `system-default`, `full-wcag`) instead of the engine's
  internal policy ids.
- Foreground-picker options show separate APCA (Lc) and WCAG (ratio) badges,
  styled and ordered the same as the scale-step badges, instead of one
  combined ratio pill.

### Added

- Foreground picking is role-aware under System default: a role that
  already carries a real WCAG requirement (`solid`) trusts APCA to judge
  which candidate reads best; a role with none (`container`) trusts WCAG's
  ratio instead. More APCA and Full WCAG 2.2 still pick one measure for
  every role.
- `ramp-collapse` audit finding, separate from `ramp-inversion`: flags two
  adjacent, correctly-ordered steps landing close enough to read as the same
  swatch.
- Scale generation automatically separates collapsed steps: a
  hue-protected step landing within visual noise of its neighbour retreats
  toward its own ideal target until the gap clears, where the neighbour has
  room to give.
- "Tinted" and "On {role}" foreground candidates are solved against the
  specific surface they're offered on, tinted with the seed hue, instead of
  being borrowed from the page-level scale or a fixed neutral constant.
- "Design a colour" states the concrete APCA Lc and WCAG ratio numbers the
  scale aims for.

### Fixed

- Vivid hues (yellow, lime, amber, orange) keep more of their chroma at the
  steps `solid`/`text`-type roles now use, instead of reading as dull or
  muddy in either mode.
- A foreground that reads fine by APCA (e.g. white on a saturated tint) is
  no longer struck through as "failing" just because its WCAG ratio misses
  4.5:1 — the strikethrough now follows whichever measure is actually
  trusted for that role.
- A pinned step's badge no longer renders as a red "fails" — `VerdictBadge`
  fell into the same catch-all as a genuine `below-both` failure. Pinned now
  shows its own neutral "pinned" badge.
- The family table's hex fields follow the value they display again: they
  were uncontrolled, so a row re-derived elsewhere (reset, snapshot, a seed
  swap) kept showing its old value while the swatch beside it had moved on.
- `.hexfield` widened from `8.5ch` to `10ch` — it was clipping the last
  digit of a 7-character hex, which could read as a different, valid-looking
  colour.

## [0.2.0] - 2026-09-09

Initial public build: an APCA-solved, WCAG-2.2-floored colour-scale solver
with the Generic and Diamond Light Source profiles, family/separation
auditing, colour-vision-deficiency simulation, seed pinning, and CSS/token
export, deployed to GitHub Pages.
