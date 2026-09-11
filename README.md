# Colour Forge

**[Open the app](https://zoharma.github.io/colour-forge/)**

Turn one colour into a full design-system role set, solved independently for
light and dark, then check it against APCA, WCAG 2.2 and colour-vision
deficiency before it reaches a token file.

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

Most palette tools pick one contrast measure and follow it off a cliff. Both
of the available ones are wrong in a different direction:

- **Pure APCA over-corrects at the saturated end.** Pushing a red to its
  dark-mode Lc target makes it a pale pink that has stopped being red. The
  number is satisfied and the colour is useless.
- **Pure WCAG 2.x under-corrects in the midtones** and over-corrects at the
  dark end, which is the whole reason APCA exists. But it is still what a
  conformance audit is written against, so it cannot simply be ignored.

So each step is solved to its APCA target, then allowed to ease off that
target, only as far as that specific hue actually needs, measured live, to
keep its chroma. It is **never taken below what WCAG 2.2 requires for how the
role is used**. Every role reports which of the three decided it:

| Verdict | Meaning |
| --- | --- |
| *(no badge)* | Reached the APCA target with the hue intact. |
| `hue held` | Eased off APCA to stay recognisably this colour. Still clears WCAG 2.2. |
| `WCAG held` | WCAG 2.2 forced more contrast than hue protection wanted, or than APCA asked for. More washed out than APCA alone would make it, on purpose. |
| `fails` | No lightness of this hue clears WCAG 2.2 for this usage. |

Making the compromise visible is the point. "Washed out" and "washed out for a
reason" look identical in a swatch.

The easing-off only happens when it *buys* something: near white the sRGB
gamut holds almost no chroma, so a pale tint scores a terrible retention ratio
while having nothing real to lose, and easing the target there pays full
contrast for no gain. The solver checks that the relaxation actually recovers
visible chroma before taking it.

### Missing AA on purpose

Some hues cannot both clear the criterion and stay themselves. An orange or an
amber has its identity in a narrow band of lightness, and 4.5:1 against a light
page sits outside it: push to the ratio and you get a brown. Forcing
conformance there does not produce an accessible orange. It produces a
compliant brown, plus a designer who overrides the tool by hand and loses the
record of why.

So the conflict is a setting, defaulting to a real compromise between the
two rather than either extreme:

| Policy | Where hue and contrast conflict |
| --- | --- |
| **More APCA** | Solve to the APCA target and keep the hue's chroma, still taking full WCAG 2.2 conformance wherever it's free. Never trades chroma away to force it. |
| **System default** | Drop one *named* level rather than take the full APCA-first result, so body text becomes large-text-only and a boundary becomes decorative. Bounded, not arbitrary — the balance between the two extremes. |
| **Full WCAG 2.2** | Never return a colour below the role's requirement, no matter what it costs the hue. |

Two guards stop this becoming a blanket downgrade, which is the failure mode
that would make it worse than useless:

- **It only fires on a genuine conflict.** A hue that can meet its requirement
  and stay itself is byte-identical under all three policies.
- **The exemption must buy something.** Giving up conformance has to gain at
  least 0.02 of OKLab chroma. Left ungated a blue will happily trade AA for
  0.013 of chroma that nobody can see. Measured across Material's 19 core
  hues, three need the exemption somewhere in the role set (amber, lime and
  yellow) and the other sixteen are untouched.

Anything below its requirement is a **blocker**, not a note: it is a decision
that has to reach whoever implements it. The audit names what the ratio is
legal for and what obligation comes with it, and the same note is written into
the exported CSS so it survives the paste into a token file.

### System default picks its measure per role, not globally

The same "real compromise, not either extreme" idea decides which measure to
*trust* when choosing a foreground for a surface, and it depends on what that
surface actually is:

- **A solid fill already carries a real WCAG requirement** (a button answers
  to 1.4.11 at 3:1 on its own). With that floor already enforced, APCA is the
  better judge of which candidate is genuinely legible on it — WCAG's ratio
  alone will happily recommend a black that reads as "passing" and unreadably
  harsh against a saturated tint.
- **A quiet container has no requirement of its own.** With nothing forcing a
  floor, WCAG's ratio is the safer default there: it favours a subtler,
  lighter tint over the darkest, most-legible-by-APCA option that a container
  does not need.

So under System default, a role with a real requirement trusts APCA; a role
without one trusts WCAG. More APCA and Full WCAG 2.2 pick one measure for
every role instead. Either way, a candidate is only shown as struck through
when it fails the measure actually being trusted for that role, not raw WCAG
pass/fail — an option that reads fine by APCA is never crossed out just
because its ratio is short of 4.5:1.

## Pinning the seed to a role

Sometimes the colour is not a suggestion. A brand colour arrives fixed and the
job is "this exact hex has to be the button fill, build the rest around it",
which is a different question from "here is a hue, give me a ramp".

Off by default, and it pins **one role in one mode**. That constraint is the
whole feature: a single hex cannot be right against both a white page and a
near-black one, so pinning both modes at once leaves whichever mode nobody was
looking at wrong. The unpinned mode is solved exactly as it would be
otherwise, which is the point of solving the two independently at all.

The tool suggests where the colour would sit rather than deciding. That is
useful even when you then pin nothing: seeding Diamond's own `#0a858e` reports
"closest to Solid in dark", which is where Diamond in fact ships it.

Two things it does not do:

- **It does not exempt the colour from being checked.** A pinned value that
  cannot carry its role is the most useful thing the tool can tell you, so it
  is measured like anything else and reported as a blocker that names the way
  out.
- **It does not let the ramp double back.** Pinning remaps each half of the
  target curve into the space the pinned step leaves it, so the endpoints stay
  where the profile put them and no two steps collapse onto one colour. Where
  a neighbouring step is held out by its own WCAG floor and the ramp inverts
  anyway, that is reported rather than shipped quietly.

### WCAG requirements come from usage

"Is 4.5:1 required here" is a question about how a role is used, not about the
colour. Each role in a profile declares its usage, and that decides what it has
to clear: text answers to 1.4.3 at 4.5:1, borders and filled actions to 1.4.11
at 3:1, and a quiet tinted wash to nothing on its own. Its paired foreground
carries the requirement instead.

### Colour-vision deficiency

Simulation is Machado, Oliveira & Fernandes (2009) at 100% severity, applied
in linear light, and can be switched on across every swatch, table and preview
at once. All measurements stay computed from the real colours: simulating and
then measuring would report contrast for vision nobody has.

The separation floor is **not one number for the whole system**. A role that
must clear a WCAG criterion is carrying meaning, so two intents landing on the
same colour there is a real loss (floor 15, blocker). A quiet wash sits close
to every other wash in every real palette. Diamond ships `tertiary` and
`brand` containers 3 apart on the 0 to 441 scale, so holding those to the same
floor condemns the entire container system and buries the findings that matter
(floor 6, warning).

## Profiles

A profile is the whole of what makes the tool specific to a design system:
role names, what each role is used for, which scale step it takes in each
mode, the CSS naming convention, and the existing intents to check against.

The `targetLc`/`chromaMultiplier` curve itself is **not** one of those
things — every profile shares the same curve, tuned once against a sweep of
Material's 19 hues to keep any two steps from converging on the same colour.
A profile's character comes entirely from its token names and which step
each role claims, never from a bespoke curve.

- **Generic**: seven usage-named roles and `--color-{intent}-*` naming,
  including a `textPrimary`/`textSecondary` split (4.5:1 body text and a
  softer 3:1 large-text weight). The starting point when the tool does not
  already know your system. Its seed palette is an evenly-spaced synthetic
  hue wheel (red, orange, yellow, green, blue, purple, pink, grey) rather
  than any shipped system's colours, and its comparison family is empty —
  there is nothing real to check a fully generic palette against.
- **MUI / Material Design 2**: MUI's own `{ light, main, dark, contrastText }`
  palette shape and `--mui-palette-{intent}-*` naming, seeded from Material
  500 and checked against MUI's six default intents, derived through this
  same solver. That is a palette real applications ship, so "does my colour
  collide with anything" is asked against something real. (MUI publishes no
  per-role values for these roles, so those are derived here and labelled as
  derived.) `light` and `dark` disagree about their step between light and
  dark page mode, with `main` fixed between them: a pigment nearer white reads
  as quiet against a light page but stands out sharply against a dark one, and
  a pigment nearer black does the reverse.
- **Material Design 3 (M3)**: M3's own colour-role shape and
  `--md-sys-color-*` naming — `base`/`on-{intent}` (the key colour itself),
  `container`/`on-{intent}-container` (a softer tonal container), and
  `baseDim`/`on-{intent}-fixed-variant` (M3's "fixed" family, a tone
  Google's spec keeps constant across light and dark theme, which this
  tool's per-mode solver cannot reproduce exactly). Seeded from M3's own
  baseline key colours (primary/secondary/tertiary/error at source colour
  #6750a4), not Material 500, which is M2's palette. Every index was fitted
  against `@material/web`'s real light/dark values for all four baseline
  colours, not just reasoned about. `base` and `container` don't swap
  between modes, unlike every other profile's container/solid pair: real M3
  keeps its key colours prominent against the page in *both* modes on
  purpose, and `container`'s own gap from its background stays small in
  both, well below `base`'s gap in either. `baseDim` keeps one index across
  both modes too, fitted to light theme's tone (which sits close to
  `container`, not to `base`) — even though dark theme's real tone for that
  pair happens to equal `base`'s own, that's a fact about M3's baseline
  scheme rather than something this profile switches its index to track.
- **IBM Carbon Design System**: role names and `--cds-{group}-{intent}`
  naming borrow Carbon's own Layer group — `background`, `layer`,
  `layer-accent` — plus `border` and Carbon's two text weights,
  `textPrimary`/`textSecondary`. Carbon's real Layer/Text tokens are neutral
  elevation tokens, not per-colour ones, so the six per-intent roles here are
  this tool's own extrapolation onto that naming; `background`, `surface` and
  `onSurface` themselves *are* the real neutral values, from Carbon's White
  and g100 themes. `seedPalette` pulls one representative step from each of
  Carbon's 10-step hue scales; `family` holds Carbon's real `interactive` and
  `support-*` (error/success/warning/info) colours, attached to
  `layerAccent` — the one role with a genuine per-colour precedent. `border`
  and `layerAccent` swap which end of the scale they sit toward between light
  and dark, the same reasoning as Diamond's `accent`/`solid`.
- **Diamond Light Source**: the `--ds-*` role set from
  [sci-react-ui](https://github.com/DiamondLightSource/sci-react-ui), with the
  nine shipped intents loaded. `seedPalette` and `family` hold the real values
  shipped in `DiamondDSTokens.css`, so seeding from one of Diamond's own
  intents checks how closely the shared curve lands near what Diamond ships
  by hand. `accent` and `solid` disagree about their step between light and
  dark, carried over from those real tokens: a solid fill reads as itself
  from chroma alone and wants less luminance separation in dark mode, while
  `accent`, the smaller role beside it, needs more.

Adding one is a data change: see `src/profiles/types.ts`, then copy
`diamond.ts` as a worked example. Reuse the shared curve and choose which
step each role claims in each mode; only touch `targetLc`/`chromaMultiplier`
if this design system's own tokens genuinely need a different shape.

## Deployment

`.github/workflows/pages.yml` builds and publishes to GitHub Pages on every
push to `main`. Tests run first, so a deploy cannot ship colour maths that is
quietly wrong.

Before the first deploy, switch Pages on: **Settings → Pages → Source →
GitHub Actions**. The workflow derives `BASE_PATH` from the repository name,
so a project page works without editing anything; a user page or custom domain
wants `BASE_PATH=/`, which is also the local default.

## Reading the output

The Material Design 2 palette at 500 is offered as one-click seeds, since it is
where most non-Diamond work starts.

Every step of both ramps is listed with its hex, not just as a swatch strip.
Half the value of generating twelve steps is the ones no role is named for (a
chart series, a hover state, a role that does not exist yet), and those are
unreachable if the only way to read a value is to hover a square. The **Full
scale** export writes them as `--{intent}-step-N`, numbered **1 to 12**.

Deliberately not `N00`: a `-500` token meaning "step 5 of 12" next to a
Material 500 seed picker is a trap. And a step number is a position in the
role ramp, not a fixed lightness. The modes are solved independently, so step
1 is the palest tint in light and the deepest in dark.

Steps are stored 0-based internally, because they index arrays, and shown
1-based everywhere a person reads them. `displayStep()` in
`src/profiles/types.ts` is the single crossing point; mixing the two
conventions is how a "step 5" in a conversation stops matching a "step 5" in a
token file.

Profile, intent name, seed and contrast policy live in the URL hash, so a
colour under discussion can be sent to someone rather than described.
