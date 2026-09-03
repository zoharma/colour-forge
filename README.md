# Colour Forge

Turn one colour into a full design-system role set — solved independently for
light and dark — then check it against APCA, WCAG 2.2 and colour-vision
deficiency before it reaches a token file.

A React port of the Colour Role Forge artifact, generalised so it is not tied
to any one design system, and with the contrast model reworked.

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
  dark end — which is the whole reason APCA exists — but it is still what a
  conformance audit is written against, so it cannot simply be ignored.

So each step is solved to its APCA target, then allowed to ease off that
target — only as far as that specific hue actually needs, measured live — to
keep its chroma, but **never below what WCAG 2.2 requires for how the role is
used**. Every role reports which of the three decided it:

| Verdict | Meaning |
| --- | --- |
| *(no badge)* | Reached the APCA target with the hue intact. |
| `hue held` | Eased off APCA to stay recognisably this colour. Still clears WCAG 2.2. |
| `WCAG held` | WCAG 2.2 forced more contrast than hue-protection wanted, or than APCA asked for. More washed out than APCA alone would make it, on purpose. |
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
page sits outside it — push to the ratio and you get a brown. Forcing
conformance there does not produce an accessible orange; it produces a
compliant brown, plus a designer who overrides the tool by hand and loses the
record of why.

So the conflict is a setting, defaulting to holding the line:

| Policy | Where hue and contrast conflict |
| --- | --- |
| **Hold WCAG 2.2** (default) | Never return a colour below the role's requirement. |
| **Allow one level down** | Drop one *named* level — body text becomes large-text-only, a boundary becomes decorative. Bounded, not arbitrary. |
| **Keep the hue** | Keep the colour and report what the ratio is actually legal for. |

Two guards stop this becoming a blanket downgrade, which is the failure mode
that would make it worse than useless:

- **It only fires on a genuine conflict.** A hue that can meet its requirement
  and stay itself is byte-identical under all three policies.
- **The exemption must buy something.** Giving up conformance has to gain at
  least 0.02 of OKLab chroma. Left ungated a blue will happily trade AA for
  0.013 of chroma that nobody can see. Measured across Material's 19 core
  hues, six need the exemption — lime, yellow, amber, orange, light blue and
  cyan — and the other thirteen are untouched.

Anything below its requirement is a **blocker**, not a note: it is a decision
that has to reach whoever implements it. The audit names what the ratio is
legal for and what obligation comes with it, and the same note is written into
the exported CSS so it survives the paste into a token file.

### WCAG requirements come from usage

"Is 4.5:1 required here" is a question about how a role is used, not about the
colour. Each role in a profile declares its usage, and that decides what it has
to clear: text answers to 1.4.3 at 4.5:1, borders and filled actions to 1.4.11
at 3:1, and a quiet tinted wash to nothing on its own — its paired foreground
carries the requirement instead.

### Colour-vision deficiency

Simulation is Machado, Oliveira & Fernandes (2009) at 100% severity, applied
in linear light, and can be switched on across every swatch, table and preview
at once. All measurements stay computed from the real colours: simulating and
then measuring would report contrast for vision nobody has.

The separation floor is **not one number for the whole system**. A role that
must clear a WCAG criterion is carrying meaning, so two intents landing on the
same colour there is a real loss (floor 15, blocker). A quiet wash sits close
to every other wash in every real palette — Diamond ships `tertiary` and
`brand` containers 3 apart on the 0–441 scale — so holding those to the same
floor condemns the entire container system and buries the findings that matter
(floor 6, warning).

## Profiles

A profile is the whole of what makes the tool specific to a design system:
role names, what each role is used for, which scale step it takes in each
mode, the target and chroma curves, the CSS naming convention, and the existing
intents to check against.

- **Generic** — six usage-named roles and `--color-{intent}-*` naming. The
  starting point when the tool does not already know your system. Its curves
  are a reasoned default rather than a fit to a shipped palette. Its
  comparison family is MUI's six default intents, derived through this same
  solver — a palette real applications ship, so "does my colour collide with
  anything" is asked against something real. (MUI publishes no per-role values
  for these roles, so those are derived here and labelled as derived.)
- **Diamond Light Source** — the `--ds-*` role set from
  [sci-react-ui](https://github.com/DiamondLightSource/sci-react-ui), with the
  nine shipped intents loaded. Its curves are fitted to `DiamondDSTokens.css`
  so that each named role's real value falls at a specific step, which is why
  light and dark disagree about the order of `accent` and `solid`.

Adding one is a data change: see `src/profiles/types.ts`, then copy
`diamond.ts` as a worked example. To make a profile land on values you would
have chosen by hand, fit its `targetLc` and `chromaMultiplier` arrays to
tokens you have already shipped, the way the Diamond profile does.

## Deployment

`.github/workflows/pages.yml` builds and publishes to GitHub Pages on every
push to `main` that touches this directory. Tests run first, so a deploy
cannot ship colour maths that is quietly wrong.

Before the first deploy, switch Pages on: **Settings → Pages → Source →
GitHub Actions**. The build sets `BASE_PATH` from the repository name for a
project page; a user page or custom domain wants `BASE_PATH=/`.

## Reading the output

The Material Design 2 palette at 500 is offered as one-click seeds, since it is
where most non-Diamond work starts.

Every step of both ramps is listed with its hex, not just as a swatch strip —
half the value of generating twelve steps is the ones no role is named for (a
chart series, a hover state, a role that does not exist yet), and those are
unreachable if the only way to read a value is to hover a square. The **Full
scale** export writes them as `--{intent}-step-N`. Deliberately not `N00`: a
`-500` token meaning "step 5 of 12" next to a Material 500 seed picker is a
trap. A step index is a position in the role ramp, not a fixed lightness — the
modes are solved independently, so step 0 is the palest tint in light and the
deepest in dark.

Profile, intent name, seed and contrast policy live in the URL hash, so a
colour under discussion can be sent to someone rather than described.
