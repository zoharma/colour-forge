# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
