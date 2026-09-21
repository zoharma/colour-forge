# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [0.5.6] - 2026-09-21

### Changed

- Audited and fixed `App.tsx` copy: mislabelled "Accessibility type" field
  (now "Contrast policy", matching its own `aria-label`), an APCA explainer
  paragraph that wrongly gave large text and non-text the same Lc 45 target
  (APCA splits them at Lc 45/60; only WCAG's 3:1 treats them the same), and
  an advanced disclosure summary missing its `profile.provenance` footnote.

## [0.5.5] - 2026-09-21

### Changed

- Renamed the "Full WCAG 2.2" contrast policy to "WCAG Strict" in the policy
  picker, so it reads as a name rather than a claim of full standard
  coverage. Its URL slug changed to match (`full-wcag` → `wcag-strict`); a
  link made before the rename still resolves correctly, the old slug just
  isn't generated anymore.
- Documented the contrast policy's three invariants in the README (the WCAG
  floor always holds, the default's concession never drops more than one
  level, the audit's blockers always agree with the solver's own verdict),
  each with a pointer to the test that enforces it.
- Added Radix Colors' 28 core hues as a second reference palette alongside
  Material's 19, and swept the contrast-policy and audit suites against
  both — Radix leans much further into muted, earthy tones than Material,
  which was previously untested territory. No behaviour or calculation
  changed; this is test coverage only.

### Fixed

- The "How the target contrast is chosen" explainer claimed the solver
  never drops below WCAG 2.2 — true only under WCAG Strict. It now names
  the actual floor per policy, including System default's one-level
  concession.

## [0.5.4] - 2026-09-17

### Changed

- Colour-vision-deficiency separation is now measured as Euclidean distance
  in OKLab rather than raw 8-bit RGB distance, so two colours that only
  differ in a channel the eye is poor at judging no longer register as
  "separated" the way RGB distance could make them. `CVD_SEPARATION_FLOOR`/
  `COMFORTABLE` and each role's `separationFloor` were recalibrated against
  every shipped profile's own family to keep already-shipped palettes about
  as quiet as before — see the doc comment on `CVD_SEPARATION_FLOOR` in
  `cvd.ts` for the calibration method and its known limits.
- The anomalous-trichromacy views (Protanomaly, Deuteranomaly, Tritanomaly)
  now use Machado et al. (2010)'s own published severity-0.6 matrices
  instead of a naive blend from identity toward the full dichromat matrix —
  the real intermediate coefficients are not a linear interpolation
  (tritanomaly's in particular are non-monotonic partway through), so the
  old approximation was measurably a different, less accurate curve.

## [0.5.3] - 2026-09-17

### Fixed

- APCA measurements (and everything the solver derives from them) were
  computed with the real piecewise sRGB EOTF instead of APCA-W3's own plain
  `c^2.4` linearisation — a divergence invisible at black/white but real
  through the midtones (`#777777` on white measured Lc 67.8 instead of the
  reference 71.1). Affected every reported Lc, the solver's generated
  colours, and the verdict each step gets.
- The verdict, and CSS/JSON export, now audit the foreground actually
  selected for a role (including a manual override) rather than only the
  tool's own recommendation — selecting a foreground that fails 4.5:1 no
  longer reports zero blockers, and a failing foreground now gets an
  explicit warning comment in the CSS export, not just the JSON's `verdict`
  field.
- "Freeze draft as an intent" silently did nothing: the frozen copy was
  always saved under the same name the live draft uses, so it was filtered
  back out of the comparison set the moment it was added. It now gets a
  distinct name and an announced confirmation.

## [0.5.2] - 2026-09-16

### Changed

- Adopted `lucide-react` for every icon in the UI: the family-table drag
  handle and remove button, the recommended-foreground star, and the
  "Advanced" disclosure chevrons now use real icons instead of text
  glyphs, and the theme toggle (system/light/dark) got matching ones.
- Added a matching icon next to the "Colour Forge" title and as the
  favicon.
- The colour-vision-deficiency dropdown now matches the height of the
  theme toggle tabs beside it.

### Fixed

- The seed hex value in the pinned header was clipped by one character.

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
