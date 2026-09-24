# Colour Forge

**[Open the app](https://zoharma.github.io/colour-forge/)**

Turn one colour into a full design-system role set, solved independently for
light and dark, then check it against APCA, WCAG 2.2 and colour-vision
deficiency before it reaches a token file.

APCA reports contrast as **Lc** ("Lightness Contrast"): a signed score,
roughly 0 to 108, rather than a ratio. Positive means dark text on a light
background, negative means light text on a dark one; most figures shown
(here and in the app) are the magnitude.

Not tied to any one design system: role names, usage, scale curves, token
naming and the existing intent family all come from a *profile*. Diamond Light
Source is one profile rather than the architecture.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # the colour maths
npm run build
```

## The contrast model

Palette tools that pick one contrast measure fail in different directions:
pure APCA over-corrects saturated colours (a red pushed to its dark-mode
target becomes a pale pink that's stopped being red), and pure WCAG under-
or over-corrects by lightness. WCAG is still what a conformance audit
checks, though, so it can't just be ignored.

Each step solves to its APCA target, then eases off, only as far as that
hue needs and only when it actually recovers chroma, never below what
WCAG 2.2 requires for how the role is used. Every step reports which of the
three decided it:

| Verdict | Meaning |
| --- | --- |
| *(no badge)* | Reached the APCA target with the hue intact. |
| `hue held` | Eased off APCA to stay recognisably this colour. Still clears WCAG 2.2. |
| `WCAG held` | WCAG 2.2 forced more contrast than hue protection or APCA asked for. |
| `fails` | No lightness of this hue clears WCAG 2.2 for this usage. |

Making the compromise visible is the point: "washed out" and "washed out for
a reason" look identical in a swatch.

### Missing AA on purpose

Some hues can't clear their WCAG criterion and stay themselves: an orange
forced to 4.5:1 becomes a compliant brown, not an accessible orange. So the
conflict is a setting, defaulting to a real compromise rather than either
extreme:

| Policy | Where hue and contrast conflict |
| --- | --- |
| **More APCA** | Solve to the APCA target, keep the hue's chroma. Never trades chroma away to force conformance. |
| **System default** | Drop one *named* level (body text → large-text-only) rather than take the full APCA-first result. |
| **WCAG Strict** | Never return a colour below the role's requirement, whatever it costs the hue. |

Two guards keep this from becoming a blanket downgrade: it only fires on a
genuine conflict (an unaffected hue is byte-identical under all three
policies), and the exemption must recover at least 0.02 of OKLab chroma.
Measured across Material's 19 core hues, only amber, lime and yellow ever
need it.

A colour below its requirement is reported as a **blocker**, not a note, and
the same explanation is written into the exported CSS so it survives the
paste into a token file.

The three claims above are swept property tests, not chosen examples: the
floor always holds across the full hue circle, the default's concession
never goes past one level, and the audit reports exactly what the solver
decided (`test/contrast-policy.test.ts`, the `audit` block in
`test/color.test.ts`), checked against Material's 19 core hues and Radix
Colors' 28.

Choosing a foreground follows the same "real compromise" logic per role,
not globally: a solid fill already carries its own WCAG floor, so APCA is
the better judge of which candidate is genuinely legible on it; a quiet
container has no floor of its own, so WCAG's ratio picks the safer, subtler
tint. A candidate is only struck through when it fails whichever measure is
actually trusted for that role.

## Pinning the seed to a role

Sometimes a colour is fixed (a brand hex has to be the button fill) rather
than a hue to build a ramp from. Off by default, and pinning fixes **one
role in one mode**: a single hex can't be right against both a white and a
near-black page, so pinning both modes at once leaves whichever mode nobody
was looking at wrong. The other mode still solves independently, which is
the point of solving the two separately at all.

The tool always suggests where a colour would sit, even when nothing is
pinned: seeding Diamond's own `#0a858e` reports "closest to Solid in dark",
which is where Diamond ships it.

Pinning doesn't exempt a colour from being checked (a pinned value that
can't carry its role is reported as a blocker that names the way out), and
it doesn't let the ramp double back: remapping keeps the endpoints fixed and
reports an inversion rather than shipping it quietly.

### WCAG requirements come from usage

"Is 4.5:1 required here" is a question about how a role is used, not about
the colour. Each role declares its usage, and that decides what it must
clear: text answers to 1.4.3 at 4.5:1, borders and filled actions to 1.4.11
at 3:1, a quiet tinted wash to nothing on its own (its paired foreground
carries the requirement instead).

### Colour-vision deficiency

Simulation is Machado, Oliveira & Fernandes (2009) at 100% severity, in
linear light, toggleable across every swatch, table and preview at once.
Measurements always come from the real colours. Simulating and then
measuring would report contrast for vision nobody has.

The separation floor isn't one number for the whole system: a role that
carries a WCAG requirement is carrying meaning, so two intents landing on
the same colour there is a real loss (floor 15, blocker). A quiet wash sits
close to every other wash in every real palette (Diamond ships `tertiary`
and `brand` containers 3 apart on a 0–441 scale), so holding washes to the
same floor would condemn the whole container system (floor 6, warning).

## Profiles

A profile is what makes the tool specific to one design system: role names,
what each is used for, which scale step it claims per mode, CSS naming, and
the existing intents to check a new colour against. The
`targetLc`/`chromaMultiplier` curve and the solving `background` are **not**
part of that: every profile shares one curve and one page background
(`BASELINE_BACKGROUND`), tuned once against a sweep of Material's 19 hues. A
profile's character comes from its token names and step choices, never a
bespoke curve or its own background. The "Baseline background" control in
the app overrides that shared background live, independent of the design
system picked; until a colour is checked against a system's own real page,
its reported contrast numbers are honest against whichever baseline is
selected, not necessarily that system's literal background.

The full rationale behind each profile's choices lives in its own doc
comment (`src/profiles/*.ts`), not here:

- **Generic** (`generic.ts`): seven usage-named roles, `--color-{intent}-*`
  naming. No real system behind it, so no comparison family; seeded from an
  evenly spaced synthetic hue wheel. The starting point when the tool
  doesn't already know your system.
- **MUI / Material Design 2** (`mui.ts`): MUI's own `{ light, main, dark,
  contrastText }` shape and `--mui-palette-{intent}-*` naming. Seeded from
  Material 500, checked against MUI's six default intents.
- **Material Design 3** (`material3.ts`): M3's own role shape
  (`base`/`container`/`baseDim` and their `on-*` pairs) and
  `--md-sys-color-*` naming. Seeded from M3's four baseline key colours;
  every step index fitted against `@material/web`'s real light/dark values.
- **IBM Carbon** (`carbon.ts`): Carbon's Layer-group naming
  (`background`/`layer`/`layer-accent`/`border`) plus its two text weights.
  `surface` and `onSurface` are Carbon's real neutral tokens (`background` is
  only the default baseline, overridable from the UI, same as every
  profile); the six per-intent roles are this tool's own extrapolation onto
  that naming.
- **Diamond Light Source** (`diamond.ts`): the `--ds-*` role set from
  [sci-react-ui](https://github.com/DiamondLightSource/sci-react-ui), with
  all nine shipped intents loaded as the comparison family.

Adding a profile is a data change: copy `diamond.ts` as a worked example,
reuse the shared curve, and choose which step each role claims per mode.

## Deployment

`.github/workflows/pages.yml` builds and publishes to GitHub Pages on every
push to `main`. Tests run first, so a deploy cannot ship colour maths that is
quietly wrong.

Before the first deploy, switch Pages on: **Settings → Pages → Source →
GitHub Actions**. The workflow derives `BASE_PATH` from the repository name,
so a project page works without editing anything; a user page or custom domain
wants `BASE_PATH=/`, which is also the local default.

## Generating results by code

`src/color/*.ts` and `src/profiles/*.ts` have no React import, so the same
solver and audit the UI uses can run from a script instead of a browser.
`scripts/generate.ts` prints one JSON object (the "Export JSON" panel's
shape) to stdout:

```bash
npm run generate -- --seed "#3366ff"
npm run generate -- --seed "#3366ff" blue --profile mui --policy hue-first --audit
npm run generate -- --seed "#3366ff" --scale
```

| Flag | Default | |
| --- | --- | --- |
| `--seed <hex>` | required | The seed colour. |
| `[name]` or `--name <string>` | the seed hex | Intent name, used for the token prefix. Positional or `--name`; `--name` wins if both are given. |
| `--profile <id>` | `generic` | One of `generic`, `mui`, `material3`, `carbon`, `diamond`. |
| `--policy <name>` | `wcag-relaxed` | `wcag-relaxed`, `hue-first` or `wcag-strict`, see "The contrast model" above. |
| `--bg-light <hex>`, `--bg-dark <hex>` | `BASELINE_BACKGROUND`'s light/dark | Overrides the shared baseline background, same as the UI's "Baseline background" control. |
| `--audit` | off | Adds a `findings` array (contrast, CVD, family and visibility checks). Combines with `--scale`. |
| `--scale` | off | Prints just the raw 12-step ramp per mode instead of the named-role tokens (same values as the UI's "Full scale" export), each step with its hex and which role(s), if any, land on it. |

## Reading the output

The Material Design 2 palette at 500 is offered as one-click seeds, since
it's where most non-Diamond work starts.

Every step of both ramps is listed with its hex, not just as a swatch: half
the value of twelve steps is the ones no role claims (a chart series, a hover
state, a role that doesn't exist yet), and those are unreachable if a hover
is the only way to read a value. The **Full scale** export writes them as
`--{intent}-step-N`, numbered 1–12, not `N00`: a step number is a position
in the ramp, not a fixed lightness, and the modes are solved independently so
step 1 is the palest tint in light and the deepest in dark.

Steps are stored 0-based (they index arrays) and shown 1-based everywhere a
person reads them, through `displayStep()` in `src/profiles/types.ts`, the
single crossing point between the two conventions.

Profile, intent name, seed, contrast policy and baseline background all live
in the URL hash, so a colour under discussion can be sent to someone rather
than described.
