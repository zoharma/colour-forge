# Colour Forge

Turns one seed colour into a full design-system role set (solved
independently for light/dark, checked against APCA, WCAG 2.2 and CVD). A
Vite + React + TypeScript SPA with no backend.

## Build, test, typecheck

```bash
npm ci             # not `npm install` — reproducible from the lockfile, never rewrites it
npm run dev        # http://localhost:5173
npm test           # vitest run — one-shot; npm run test:watch to watch
npm run typecheck  # tsc -b --noEmit
npm run build      # tsc -b && vite build — also the real type-check gate
```

There is no linter or formatter configured (no ESLint/Prettier config in the
repo) — don't run `npm run lint` or reach for `npx prettier`/`npx eslint`,
they aren't set up.

The colour maths is the whole product: run `npm test` before treating any
change under `src/color/` or `src/profiles/` as done. CI
(`.github/workflows/pages.yml`) runs `npm test` before every deploy and
blocks the deploy on failure.

## Generated files — don't hand-edit

- `dist/` — build output, gitignored. Regenerate with `npm run build`.
- Root `index.html` is the tracked Vite entry template (edit this one).
  `dist/index.html` is generated from it on build — don't confuse the two or
  edit the built copy.

## Architecture boundaries

- `src/color/*.ts` — pure colour maths (APCA, WCAG, OKLCH, sRGB, CVD
  simulation, solver, scale generation, audit, export). No React import
  anywhere in here; keep it that way so it stays framework-free and
  independently testable.
- `src/profiles/*.ts` — data describing each design system: role names,
  role usage, step selection, CSS naming, seed/comparison families and the
  light/dark scale arrays. All profiles currently use the same
  `targetLc`/`chromaMultiplier` curves. Keep them aligned unless real system
  tokens and regression tests justify a different curve. Adding a design
  system should normally be a data change: copy `src/profiles/diamond.ts`
  as a worked example and see README "Profiles" for each field.
- `src/ui/*.tsx` — presentational React components.
- `src/App.tsx` — state and orchestration; syncs profile, intent name, seed
  and contrast policy to the URL hash (so a colour under discussion can be
  linked, not just described).

The rationale behind the APCA/WCAG compromise itself is documented in the
doc-comments at the top of `src/color/solver.ts` and `src/color/scale.ts`,
and in the README's "The contrast model" section — read those rather than
re-deriving the policy from the code.

## Conventions

- Scale steps are stored 0-based (they index arrays) and shown 1-based
  everywhere a person reads them (labels, exported token names, findings).
  Always convert through `displayStep()` in `src/profiles/types.ts` — don't
  add 1 by hand, and don't compare a raw stored index against a step number
  a person typed or a token name contains.
- The UI version comes from `package.json`, injected by `vite.config.ts` as
  `__APP_VERSION__` (declared in `src/vite-env.d.ts`). Record notable
  user-facing changes under `[Unreleased]` in `CHANGELOG.md`. Do not bump
  the version or create a release tag unless the task explicitly includes
  preparing a release.

## Testing colour maths

- Add a regression test for every corrected numerical or colour-maths edge
  case; passing the existing suite alone is not sufficient.
- Test solver changes across both modes, several hue families and gamut
  extremes. Do not validate a solver change using only the reported seed.
- Assert the property that matters — contrast, conformance, ordering,
  distinctness or verdict — not merely that the result is a valid hex colour.
- Where practical, verify that unrelated profiles and policies retain their
  previous output.

## Deployment

`.github/workflows/pages.yml` deploys to GitHub Pages on push to `main`,
setting `BASE_PATH=/<repo-name>/` for that build only. Local dev and
`vite preview` default `BASE_PATH` to `/`. Don't hardcode a base path in
source — it must keep coming from `vite.config.ts`'s `base` (via the
`BASE_PATH` env var) so the app works both as a project page and locally.
