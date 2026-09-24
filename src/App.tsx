import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Monitor, Moon, Sun, SwatchBook } from "lucide-react";

import { auditDraft, draftAsIntent, separationRows } from "./color/audit";
import type { CvdView } from "./color/cvd";
import {
  POLICY_DESCRIPTIONS,
  POLICY_LABELS,
  type ContrastPolicy,
} from "./color/solver";
import { buildDraft } from "./color/scale";
import { suggestPin, type PinSpec } from "./color/pin";
import { isValidHex, normaliseHex } from "./color/srgb";
import {
  BASELINE_BACKGROUND,
  DEFAULT_PROFILE_ID,
  PROFILES,
  findProfile,
  type ModeKey,
  type SeededIntent,
} from "./profiles";
import { POLICY_SLUGS, policyFromSlug } from "./urlPolicySlug";
import { CVD_LABELS } from "./color/cvd";
import { CvdControl, CVD_NOTES } from "./ui/CvdControl";
import { ExportPanel } from "./ui/ExportPanel";
import { FamilyTable } from "./ui/FamilyTable";
import { Findings } from "./ui/Findings";
import { PinControl } from "./ui/PinControl";
import { ScalePanel } from "./ui/ScalePanel";
import { ScaleTable } from "./ui/ScaleTable";
import { SeedPicker } from "./ui/SeedPicker";
import { SeparationTable } from "./ui/SeparationTable";

type ThemeChoice = "system" | "light" | "dark";

const THEME_ICONS: Record<ThemeChoice, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon };

const MODES: ModeKey[] = ["light", "dark"];

const INTRO_TEXT =
  "Turn one colour into a full role set, tuned independently for light and dark, then check it " +
  "against APCA, WCAG 2.2 and colour-vision deficiency before it reaches a token file.";

/** Seed, name and profile live in the URL so a colour under discussion can be
 *  sent to someone rather than described. Everything else is local taste. */
function readUrlState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const seed = params.get("seed");
  const bgLight = params.get("bgLight");
  const bgDark = params.get("bgDark");
  return {
    profileId: params.get("profile") ?? DEFAULT_PROFILE_ID,
    name: params.get("name") ?? "draft",
    policy: policyFromSlug(params.get("policy")),
    pin: parsePin(params.get("pin")),
    // Not one of the example intents: seeding on top of one opens the tool
    // onto a wall of collisions with itself, which reads as the tool being
    // broken rather than as the finding it is.
    seedHex: seed && isValidHex(seed) ? normaliseHex(seed) : "#7b4fb8",
    // Independent of which profile is picked — a design system supplies
    // role names and step placement, not the page the scale solves against.
    baselineLight: bgLight && isValidHex(bgLight) ? normaliseHex(bgLight) : BASELINE_BACKGROUND.light,
    baselineDark: bgDark && isValidHex(bgDark) ? normaliseHex(bgDark) : BASELINE_BACKGROUND.dark,
  };
}

/** "light:solid" — mode and role, so a pinned palette shares as a link like
 *  any other. Nothing is pinned unless the parameter says so. */
function parsePin(raw: string | null): PinSpec | undefined {
  if (!raw) return undefined;
  const [mode, roleKey] = raw.split(":");
  if ((mode !== "light" && mode !== "dark") || !roleKey) return undefined;
  return { mode, roleKey };
}

/** Shared by every hex field (seed, baseline light, baseline dark): only
 *  commit a value that actually parses, and keep the live-typed draft in
 *  sync with whatever was committed rather than whatever was typed. */
function commitHexTo(value: string, setValue: (next: string) => void, setDraft: (next: string) => void) {
  if (!isValidHex(value)) return;
  const next = normaliseHex(value);
  setValue(next);
  setDraft(next);
}

/** A hex field's committed value, its live-typed draft, and the two setters
 *  a text input needs (setDraft for every keystroke, commit for blur/Enter)
 *  — one implementation shared by the seed and both baseline fields, rather
 *  than three hand-rolled (value, draft, commit) triples. Returned as a
 *  tuple so each call site can destructure straight into its existing
 *  variable names. */
function useHexField(initial: string): [string, string, (next: string) => void, (next: string) => void] {
  const [value, setValue] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const commit = useCallback((next: string) => commitHexTo(next, setValue, setDraft), []);
  return [value, draft, setDraft, commit];
}

function readStored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function App() {
  const initial = useMemo(readUrlState, []);
  const [profileId, setProfileId] = useState(initial.profileId);
  const [name, setName] = useState(initial.name);
  const [policy, setPolicy] = useState<ContrastPolicy>(initial.policy);
  const [showScale, setShowScale] = useState(false);
  const [pin, setPin] = useState<PinSpec | undefined>(initial.pin);
  const [seedHex, hexDraft, setHexDraft, commitHex] = useHexField(initial.seedHex);
  const [baselineLight, baselineLightDraft, setBaselineLightDraft, commitBaselineLight] = useHexField(
    initial.baselineLight,
  );
  const [baselineDark, baselineDarkDraft, setBaselineDarkDraft, commitBaselineDark] = useHexField(
    initial.baselineDark,
  );
  const [cvdView, setCvdView] = useState<CvdView>(() => readStored<CvdView>("cf-cvd", "none"));
  const [theme, setTheme] = useState<ThemeChoice>(() => readStored<ThemeChoice>("cf-theme", "system"));
  const [foregroundOverrides, setForegroundOverrides] = useState<Record<ModeKey, Record<string, string>>>({
    light: {},
    dark: {},
  });

  const baseProfile = useMemo(() => findProfile(profileId), [profileId]);
  const [family, setFamily] = useState<SeededIntent[]>(() => findProfile(initial.profileId).family);

  // Switching profile changes the role vocabulary itself, so a family, a set
  // of foreground picks and a pinned role key from the previous one no longer
  // mean anything. Keyed on baseProfile, not the baseline-overridden profile
  // below, so editing the baseline background alone does not also wipe these.
  useEffect(() => {
    setFamily(baseProfile.family);
    setForegroundOverrides({ light: {}, dark: {} });
    setPin((current) =>
      current && baseProfile.roles.some((r) => r.key === current.roleKey) ? current : undefined,
    );
  }, [baseProfile]);

  // The scale solves against the baseline background regardless of which
  // design system is selected — a profile supplies role names, step
  // placement and CSS naming, not the page it's solved against. Every other
  // consumer of `profile` below (draft, audit, preview, export) sees this
  // overridden object, so the override only has to happen once, here.
  const profile = useMemo(
    () => ({
      ...baseProfile,
      modes: {
        light: { ...baseProfile.modes.light, background: baselineLight },
        dark: { ...baseProfile.modes.dark, background: baselineDark },
      },
    }),
    [baseProfile, baselineLight, baselineDark],
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("cf-theme", theme);
    } catch {
      /* private browsing, or storage disabled */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("cf-cvd", cvdView);
    } catch {
      /* as above */
    }
  }, [cvdView]);

  useEffect(() => {
    const params = new URLSearchParams({
      profile: profileId,
      name,
      seed: seedHex,
      policy: POLICY_SLUGS[policy],
      bgLight: baselineLight,
      bgDark: baselineDark,
    });
    if (pin) params.set("pin", `${pin.mode}:${pin.roleKey}`);
    window.history.replaceState(null, "", `#${params.toString()}`);
  }, [profileId, name, seedHex, policy, pin, baselineLight, baselineDark]);

  const draft = useMemo(
    () => buildDraft(profile, name.trim() || "draft", seedHex, policy, pin),
    [profile, name, seedHex, policy, pin],
  );

  const pinSuggestion = useMemo(() => suggestPin(profile, seedHex), [profile, seedHex]);

  // The draft participates in the family checks as a live row, so a change to
  // the seed is reflected in the separation table immediately.
  const familyWithDraft = useMemo(() => {
    const asIntent = draftAsIntent(profile, draft);
    const withoutStale = family.filter((f) => f.name !== asIntent.name);
    return [...withoutStale, asIntent];
  }, [profile, draft, family]);

  const findings = useMemo(
    () => auditDraft(profile, draft, familyWithDraft, foregroundOverrides),
    [profile, draft, familyWithDraft, foregroundOverrides],
  );
  const rows = useMemo(() => separationRows(profile, familyWithDraft), [profile, familyWithDraft]);

  const resetBaseline = useCallback(() => {
    commitBaselineLight(BASELINE_BACKGROUND.light);
    commitBaselineDark(BASELINE_BACKGROUND.dark);
  }, [commitBaselineLight, commitBaselineDark]);

  const setForeground = (mode: ModeKey, roleKey: string, label: string) =>
    setForegroundOverrides((prev) => ({ ...prev, [mode]: { ...prev[mode], [roleKey]: label } }));

  // The live draft always occupies `asIntent.name` in familyWithDraft (see
  // above), so a frozen copy saved under that same name would be filtered
  // straight back out the moment it's added — it has to get a distinct name
  // even when nothing in `family` yet collides with the bare one.
  const snapshotDraft = () => {
    const asIntent = draftAsIntent(profile, draft);
    let n = 2;
    let candidate = `${asIntent.name}-${n}`;
    while (family.some((f) => f.name === candidate)) {
      n += 1;
      candidate = `${asIntent.name}-${n}`;
    }
    setFamily([...family, { ...asIntent, name: candidate }]);
    return candidate;
  };

  const o = draft.seedOklch;

  return (
    <>
      <a className="skip-link" href="#roles">
        Skip to the generated roles
      </a>

      <div className="shell">
        {/* Only the title and the two view controls stay pinned. The
            description belongs to the first read, not to every screen, and
            keeping it in the bar would pin a couple of hundred pixels of
            prose on a phone. */}
        <header className="top">
          <div className="header-title-group">
            <h1>
              <SwatchBook className="title-icon" size={24} aria-hidden="true" /> Colour Forge{" "}
              <span className="version-badge">v{__APP_VERSION__}</span>
            </h1>
            <div className="header-seed">
              <label className="visually-hidden" htmlFor="hex-header">
                Seed colour
              </label>
              <input
                type="color"
                value={seedHex}
                aria-label="Seed colour picker"
                onChange={(e) => commitHex(e.target.value)}
              />
              <input
                id="hex-header"
                type="text"
                size={9}
                value={hexDraft}
                onChange={(e) => setHexDraft(e.target.value)}
                onBlur={(e) => commitHex(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitHex(e.currentTarget.value.trim());
                }}
              />
            </div>
          </div>
          <div className="view-controls">
            <CvdControl view={cvdView} onChange={setCvdView} />
            <div className="segmented" role="group" aria-label="Page theme">
              {(["system", "light", "dark"] as ThemeChoice[]).map((choice) => {
                const Icon = THEME_ICONS[choice];
                return (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={theme === choice}
                    onClick={() => setTheme(choice)}
                  >
                    <Icon size={13} aria-hidden="true" />
                    {choice}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {cvdView !== "none" ? (
          <div className="intro-row">
            <p className="intro">{INTRO_TEXT}</p>
            <p className="banner" aria-live="polite">
              <strong>Simulating {CVD_LABELS[cvdView].toLowerCase()}.</strong> {CVD_NOTES[cvdView]} Every
              number on the page is still measured from the real colours. Only what you see is
              simulated.
            </p>
          </div>
        ) : (
          <p className="intro">{INTRO_TEXT}</p>
        )}

        <section>
          <p className="eyebrow">1 · Input</p>
          <h2 className="section-title">Design a colour</h2>
          <p className="section-note">
            Pick a seed colour and a baseline background below, and a design system to draw its role
            names and tokens from. Colour Forge solves a full light- and dark-mode role set from it,
            then checks every role against APCA, WCAG 2.2 and colour-vision deficiency.
          </p>

          <details className="advanced">
            <summary>
              <ChevronRight className="advanced-chevron" size={14} aria-hidden="true" />
              How the target contrast is chosen
            </summary>
            <div className="advanced-body">
              <p className="section-note" style={{ marginTop: 12 }}>
                The seed's hue and chroma drive a {profile.scaleSize}-step scale solved separately for each
                mode. Each step aims at an APCA target, eases off only as far as that hue needs to stay
                recognisable, and never drops below what the active policy requires — the full WCAG 2.2
                floor under WCAG Strict, one level less under System default, no floor under More APCA. A
                badge appears on any role where those disagreed.
              </p>
              <p className="section-note" style={{ marginBottom: 0 }}>
                APCA targets run from Lc 45 for non-text elements, Lc 60 for large text, up to Lc 75+ for
                body copy — APCA scores those two differently even though WCAG doesn't. WCAG 2.2 asks for a
                ratio of at least 3:1 for large text or non-text, 4.5:1 for normal body text, and 7:1 where
                AAA is required.
              </p>
            </div>
          </details>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="setup-grid">
              <div>
                <div className="input-row">
                  <div>
                    <label className="field-label" htmlFor="hex">
                      Seed colour
                    </label>
                    <div className="hex-input-group">
                      <input
                        type="color"
                        value={seedHex}
                        aria-label="Seed colour picker"
                        onChange={(e) => commitHex(e.target.value)}
                      />
                      <input
                        id="hex"
                        type="text"
                        size={9}
                        value={hexDraft}
                        onChange={(e) => setHexDraft(e.target.value)}
                        onBlur={(e) => commitHex(e.target.value.trim())}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitHex(e.currentTarget.value.trim());
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="intent-name">
                      Intent name
                    </label>
                    <input
                      id="intent-name"
                      type="text"
                      value={name}
                      style={{ fontFamily: "var(--font-ui)", width: "14ch" }}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <label className="field-label" htmlFor="baseline-light">
                    Baseline background
                  </label>
                  <p className="foot-note" style={{ marginTop: 0, marginBottom: 8 }}>
                    Every step re-solves against this background to keep its target contrast.
                  </p>
                  <div className="input-row">
                    <div className="hex-input-group">
                      <input
                        type="color"
                        value={baselineLight}
                        aria-label="Baseline background, light mode"
                        onChange={(e) => commitBaselineLight(e.target.value)}
                      />
                      <input
                        id="baseline-light"
                        type="text"
                        size={9}
                        aria-label="Baseline background, light mode hex"
                        value={baselineLightDraft}
                        onChange={(e) => setBaselineLightDraft(e.target.value)}
                        onBlur={(e) => commitBaselineLight(e.target.value.trim())}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitBaselineLight(e.currentTarget.value.trim());
                        }}
                      />
                    </div>
                    <div className="hex-input-group">
                      <input
                        type="color"
                        value={baselineDark}
                        aria-label="Baseline background, dark mode"
                        onChange={(e) => commitBaselineDark(e.target.value)}
                      />
                      <input
                        id="baseline-dark"
                        type="text"
                        size={9}
                        aria-label="Baseline background, dark mode hex"
                        value={baselineDarkDraft}
                        onChange={(e) => setBaselineDarkDraft(e.target.value)}
                        onBlur={(e) => commitBaselineDark(e.target.value.trim())}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitBaselineDark(e.currentTarget.value.trim());
                        }}
                      />
                    </div>
                    <button className="btn tiny ghost" type="button" onClick={resetBaseline}>
                      Reset to default
                    </button>
                  </div>
                </div>
              </div>

              <div className="seed-quickpicks">
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" htmlFor="profile">
                    Design system
                  </label>
                  <select id="profile" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                    {PROFILES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <span className="field-label">One-click seeds: {profile.seedPaletteLabel}</span>
                <SeedPicker profile={profile} seedHex={seedHex} cvdView={cvdView} onPick={commitHex} />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <span className="field-label">Contrast policy</span>
              <div className="segmented" role="group" aria-label="Contrast policy">
                {(["hue-first", "wcag-relaxed", "wcag-strict"] as ContrastPolicy[]).map((p) => (
                  <button key={p} type="button" aria-pressed={policy === p} onClick={() => setPolicy(p)}>
                    {POLICY_LABELS[p]}
                  </button>
                ))}
              </div>
              <p className="policy-note">{POLICY_DESCRIPTIONS[policy]}</p>
            </div>

            <details className="advanced" style={{ marginTop: 18 }}>
              <summary>
                <ChevronRight className="advanced-chevron" size={14} aria-hidden="true" />
                Advanced: seed placement, raw values &amp; profile provenance
              </summary>
              <div className="advanced-body">
                <div style={{ marginTop: 14 }}>
                  <span className="field-label">Seed placement</span>
                  <PinControl profile={profile} pin={pin} suggestion={pinSuggestion} onChange={setPin} />
                </div>

                <p className="readout" style={{ marginTop: 14 }}>
                  OKLCH <b>L</b> {o.L.toFixed(3)} <b>C</b> {o.C.toFixed(3)} <b>H</b> {o.H.toFixed(1)}°
                </p>

                <p className="foot-note">{profile.provenance}</p>
              </div>
            </details>

            <div className="mode-columns" id="roles" style={{ scrollMarginTop: 76 }}>
              {MODES.map((mode) => (
                <ScalePanel
                  key={mode}
                  profile={profile}
                  draft={draft}
                  mode={mode}
                  cvdView={cvdView}
                  foregroundOverrides={foregroundOverrides[mode]}
                  onForegroundChange={(roleKey, label) => setForeground(mode, roleKey, label)}
                />
              ))}
            </div>

            <details
              className="advanced"
              style={{ marginTop: 18 }}
              open={showScale}
              onToggle={(e) => setShowScale(e.currentTarget.open)}
            >
              <summary>
                <ChevronRight className="advanced-chevron" size={14} aria-hidden="true" />
                Advanced: all {profile.scaleSize} steps with hex values
              </summary>
              <div className="advanced-body">
                <div style={{ marginTop: 12 }}>
                  <ScaleTable profile={profile} draft={draft} cvdView={cvdView} />
                  <p className="foot-note">
                    Steps no role claims are spare capacity: a chart series, a hover state, a role that does
                    not exist yet. The Full scale export has them as numbered tokens.
                  </p>
                </div>
              </div>
            </details>
          </div>
        </section>

        <section>
          <p className="eyebrow">2 · Cross-check</p>
          <h2 className="section-title">The family it has to live in</h2>
          <p className="section-note">
            Checks the new colour against the design system's other intents under simulated colour-vision
            deficiency, so two roles that only differ by hue don't quietly collapse into each other.
          </p>

          <details className="advanced">
            <summary>
              <ChevronRight className="advanced-chevron" size={14} aria-hidden="true" />
              How separation is measured
            </summary>
            <div className="advanced-body">
              <p className="section-note" style={{ marginTop: 12, marginBottom: 0 }}>
                Separation is simulated per Machado, Oliveira &amp; Fernandes (2009) at 100% severity. The
                floor is not one number: a role that must clear a WCAG criterion carries meaning, so two
                intents landing on the same colour there is a real loss. Quiet tinted surfaces sit close
                together in every real palette, so only an outright duplicate there is worth flagging.
              </p>
            </div>
          </details>

          <div className="card" style={{ marginTop: 18 }}>
            <FamilyTable
              profile={profile}
              family={familyWithDraft}
              draftName={draft.name}
              cvdView={cvdView}
              onChange={(next) => setFamily(next.filter((f) => f.name !== draft.name))}
              onReset={() => setFamily(profile.family)}
              onSnapshot={snapshotDraft}
            />
            <details className="advanced" style={{ marginTop: 18 }}>
              <summary>
                <ChevronRight className="advanced-chevron" size={14} aria-hidden="true" />
                Advanced: pairwise separation numbers
              </summary>
              <div className="advanced-body">
                <div style={{ marginTop: 14 }}>
                  <SeparationTable rows={rows} />
                </div>
              </div>
            </details>
          </div>
        </section>

        <section>
          <p className="eyebrow">3 · Verdict</p>
          <h2 className="section-title">What the checks found</h2>
          <p className="section-note">
            A measuring tool, not an optimiser. A sweep that only maximises separation reliably breaks
            hue-family consistency and sibling parity, so these are trade-offs to make deliberately rather
            than corrections to apply.
          </p>
          <div className="card">
            <Findings findings={findings} />
          </div>
        </section>

        <section>
          <p className="eyebrow">4 · Output</p>
          <h2 className="section-title">Tokens</h2>
          <p className="section-note">
            In {profile.name}'s own naming convention, for this intent only.
          </p>
          <div className="card">
            <ExportPanel profile={profile} draft={draft} foregroundOverrides={foregroundOverrides} />
          </div>
        </section>
      </div>
    </>
  );
}
