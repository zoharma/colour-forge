import { it, expect } from "vitest";
import { wcagRatioHex, wcagLevel } from "../src/color/wcag";
import { apcaHex } from "../src/color/apca";

// The tool argues for 1.4.3 and 1.4.11; it should not fail them itself.
const LIGHT = { paper: "#f2f3f8", panel: "#ffffff", sunken: "#e8eaf2",
  ink: "#12141c", inkSoft: "#464b5c", muted: "#5b5f75", accent: "#33509f", focus: "#1f3d78",
  good: "#146c34", goodBg: "#dff3e6", warn: "#8a5000", warnBg: "#fdecd2", bad: "#a3241c", badBg: "#fbe2e0" };
const DARK = { paper: "#0d0f16", panel: "#161822", sunken: "#1e212c",
  ink: "#e7e9f2", inkSoft: "#c2c6d6", muted: "#9096ab", accent: "#8aa7ff", focus: "#c4d4ff",
  good: "#6fd88a", goodBg: "#123422", warn: "#ffb067", warnBg: "#3a2508", bad: "#ff9088", badBg: "#3a1613" };

it("the app's own chrome passes what it asks of others", () => {
  const rows: string[] = [];
  let failures = 0;
  for (const [name, t] of [["light", LIGHT], ["dark", DARK]] as const) {
    const checks: [string, string, string, number][] = [
      ["body text on panel", t.ink, t.panel, 4.5],
      ["body text on paper", t.ink, t.paper, 4.5],
      ["secondary text on panel", t.inkSoft, t.panel, 4.5],
      ["muted text on panel", t.muted, t.panel, 4.5],
      ["muted text on paper", t.muted, t.paper, 4.5],
      ["eyebrow accent on paper", t.accent, t.paper, 4.5],
      ["focus ring on paper", t.focus, t.paper, 3],
      ["focus ring on panel", t.focus, t.panel, 3],
      ["good pill", t.good, t.goodBg, 4.5],
      ["warn pill", t.warn, t.warnBg, 4.5],
      ["bad pill", t.bad, t.badBg, 4.5],
      ["muted on sunken", t.muted, t.sunken, 4.5],
    ];
    for (const [label, fg, bg, min] of checks) {
      const r = wcagRatioHex(fg, bg);
      const ok = r >= min;
      if (!ok) failures++;
      rows.push(`  ${ok ? "PASS" : "FAIL"} ${name} ${label.padEnd(26)} ${r.toFixed(2)}:1 (need ${min}) ${wcagLevel(r)} · APCA Lc ${Math.abs(apcaHex(fg, bg)).toFixed(0)}`);
    }
  }
  if (failures) console.log(rows.join("\n"));
  expect(failures, "app chrome contrast failures").toBe(0);
});
