import { useCallback, useEffect, useMemo, useState } from "react";

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
import { DEFAULT_PROFILE_ID, PROFILES, findProfile, type ModeKey, type SeededIntent } from "./profiles";
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

const MODES: ModeKey[] = ["light", "dark"];

/** Seed, name and profile live in the URL so a colour under discussion can be
 *  sent to someone rather than described. Everything else is local taste. */
function readUrlState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const seed = params.get("seed");
  return {
    profileId: params.get("profile") ?? DEFAULT_PROFILE_ID,
    name: params.get("name") ?? "draft",
    policy: (params.get("policy") as ContrastPolicy | null) ?? "wcag-strict",
    pin: parsePin(params.get("pin")),
    // Not one of the example intents: seeding on top of one opens the tool
    // onto a wall of collisions with itself, which reads as the tool being
    // broken rather than as the finding it is.
    seedHex: seed && isValidHex(seed) ? normaliseHex(seed) : "#7b4fb8",
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
  const [seedHex, setSeedHex] = useState(initial.seedHex);
  const [policy, setPolicy] = useState<ContrastPolicy>(initial.policy);
  const [showScale, setShowScale] = useState(false);
  const [pin, setPin] = useState<PinSpec | undefined>(initial.pin);
  const [hexDraft, setHexDraft] = useState(initial.seedHex);
  const [cvdView, setCvdView] = useState<CvdView>(() => readStored<CvdView>("cf-cvd", "none"));
  const [theme, setTheme] = useState<ThemeChoice>(() => readStored<ThemeChoice>("cf-theme", "system"));
  const [foregroundOverrides, setForegroundOverrides] = useState<Record<ModeKey, Record<string, string>>>({
    light: {},
    dark: {},
  });

  const profile = useMemo(() => findProfile(profileId), [profileId]);
  const [family, setFamily] = useState<SeededIntent[]>(() => findProfile(initial.profileId).family);

  // Switching profile changes the role vocabulary itself, so a family, a set
  // of foreground picks and a pinned role key from the previous one no longer
  // mean anything.
  useEffect(() => {
    setFamily(profile.family);
    setForegroundOverrides({ light: {}, dark: {} });
    setPin((current) =>
      current && profile.roles.some((r) => r.key === current.roleKey) ? current : undefined,
    );
  }, [profile]);

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
    const params = new URLSearchParams({ profile: profileId, name, seed: seedHex, policy });
    if (pin) params.set("pin", `${pin.mode}:${pin.roleKey}`);
    window.history.replaceState(null, "", `#${params.toString()}`);
  }, [profileId, name, seedHex, policy, pin]);

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
    () => auditDraft(profile, draft, familyWithDraft),
    [profile, draft, familyWithDraft],
  );
  const rows = useMemo(() => separationRows(profile, familyWithDraft), [profile, familyWithDraft]);

  const commitHex = useCallback((value: string) => {
    if (!isValidHex(value)) return;
    const next = normaliseHex(value);
    setSeedHex(next);
    setHexDraft(next);
  }, []);

  const setForeground = (mode: ModeKey, roleKey: string, label: string) =>
    setForegroundOverrides((prev) => ({ ...prev, [mode]: { ...prev[mode], [roleKey]: label } }));

  const snapshotDraft = () => {
    const asIntent = draftAsIntent(profile, draft);
    let candidate = asIntent.name;
    for (let n = 2; family.some((f) => f.name === candidate); n++) candidate = `${asIntent.name}-${n}`;
    setFamily([...family, { ...asIntent, name: candidate }]);
  };

  const o = draft.seedOklch;

  return (
    <>
      <a className="skip-link" href="#roles">
        Skip to the generated roles
      </a>

      <div className="shell">
        <header className="top">
          <div>
            <h1>Colour Forge</h1>
            <p>
              Turn one colour into a full role set, tuned independently for light and dark, then check it
              against APCA, WCAG 2.2 and colour-vision deficiency before it reaches a token file.
            </p>
          </div>
          <div className="view-controls">
            <div className="segmented" role="group" aria-label="Page theme">
              {(["system", "light", "dark"] as ThemeChoice[]).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={theme === choice}
                  onClick={() => setTheme(choice)}
                >
                  {choice}
                </button>
              ))}
            </div>
            <CvdControl view={cvdView} onChange={setCvdView} />
          </div>
        </header>

        {cvdView !== "none" && (
          <p className="banner" aria-live="polite">
            <strong>Simulating {CVD_LABELS[cvdView].toLowerCase()}.</strong> {CVD_NOTES[cvdView]} Every
            number on the page is still measured from the real colours. Only what you see is simulated.
          </p>
        )}

        <section>
          <p className="eyebrow">Input</p>
          <h2 className="section-title">Design a colour</h2>
          <p className="section-note">
            The seed's hue and chroma drive a {profile.scaleSize}-step scale solved separately for each mode.
            Each step aims at an APCA target, eases off only as far as that hue needs to stay recognisable,
            and never drops below what WCAG 2.2 requires for how the role is used — a badge appears on any
            role where those disagreed.
          </p>

          <div className="card">
            <div className="input-row">
              <div>
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

            </div>

            <div style={{ marginTop: 16 }}>
              <span className="field-label">{profile.seedPaletteLabel} — one-click seeds</span>
              <SeedPicker profile={profile} seedHex={seedHex} cvdView={cvdView} onPick={commitHex} />
            </div>

            <div style={{ marginTop: 16 }}>
              <span className="field-label">Seed placement</span>
              <PinControl profile={profile} pin={pin} suggestion={pinSuggestion} onChange={setPin} />
            </div>

            <div style={{ marginTop: 16 }}>
              <span className="field-label">Where hue and WCAG 2.2 conflict</span>
              <div className="segmented" role="group" aria-label="Contrast policy">
                {(["wcag-strict", "wcag-relaxed", "hue-first"] as ContrastPolicy[]).map((p) => (
                  <button key={p} type="button" aria-pressed={policy === p} onClick={() => setPolicy(p)}>
                    {POLICY_LABELS[p]}
                  </button>
                ))}
              </div>
              <p className="policy-note">
                {POLICY_DESCRIPTIONS[policy]}{" "}
                {policy !== "wcag-strict" && (
                  <strong>
                    Only fires where the conflict is real — a hue that can meet the criterion and stay
                    itself is unaffected.
                  </strong>
                )}
              </p>
            </div>

            <p className="readout" style={{ marginTop: 14 }}>
              OKLCH <b>L</b> {o.L.toFixed(3)} <b>C</b> {o.C.toFixed(3)} <b>H</b> {o.H.toFixed(1)}°
            </p>

            <p className="foot-note">{profile.provenance}</p>

            <div className="mode-columns" id="roles">
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

            <details style={{ marginTop: 18 }} open={showScale} onToggle={(e) => setShowScale(e.currentTarget.open)}>
              <summary style={{ cursor: "pointer", fontSize: "0.8125rem" }}>
                All {profile.scaleSize} steps with hex values
              </summary>
              <div style={{ marginTop: 12 }}>
                <ScaleTable profile={profile} draft={draft} cvdView={cvdView} />
                <p className="foot-note">
                  Steps no role claims are spare capacity — a chart series, a hover state, a role that does
                  not exist yet. The Full scale export has them as numbered tokens.
                </p>
              </div>
            </details>
          </div>
        </section>

        <section>
          <p className="eyebrow">Cross-check</p>
          <h2 className="section-title">The family it has to live in</h2>
          <p className="section-note">
            Separation is simulated per Machado, Oliveira &amp; Fernandes (2009) at 100% severity. The floor
            is not one number: a role that must clear a WCAG criterion is carrying meaning, so two intents
            landing on the same colour there is a real loss — while quiet tinted surfaces sit close together
            in every real palette, and only an outright duplicate is worth saying.
          </p>
          <div className="card">
            <FamilyTable
              profile={profile}
              family={familyWithDraft}
              draftName={draft.name}
              cvdView={cvdView}
              onChange={(next) => setFamily(next.filter((f) => f.name !== draft.name))}
              onReset={() => setFamily(profile.family)}
              onSnapshot={snapshotDraft}
            />
            <div style={{ marginTop: 18 }}>
              <SeparationTable rows={rows} />
            </div>
          </div>
        </section>

        <section>
          <p className="eyebrow">Verdict</p>
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
          <p className="eyebrow">Output</p>
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
