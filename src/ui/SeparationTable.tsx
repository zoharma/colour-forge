import { CVD_SEPARATION_COMFORTABLE } from "../color/cvd";
import type { SeparationRow } from "../color/audit";

/** Worst-case separation per role, per mode, across every pair of intents.
 *  The floor column is doing real work: it is not the same number for every
 *  row, because a tinted wash and a filled action are not carrying the same
 *  amount of meaning. */
export function SeparationTable({ rows }: { rows: SeparationRow[] }) {
  return (
    <div className="scroll-x">
      <table>
        <caption className="visually-hidden">
          Worst colour-vision-deficiency separation for each role in each mode
        </caption>
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Mode</th>
            <th scope="col">Closest pair</th>
            <th scope="col">Separation</th>
            <th scope="col">Floor</th>
            <th scope="col">Others under floor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (!row.worst) {
              return (
                <tr key={`${row.mode}-${row.role}`}>
                  <td>{row.roleLabel}</td>
                  <td>{row.mode}</td>
                  <td colSpan={4} className="readout">
                    {row.count < 2 ? "not enough intents carry this role to compare" : "—"}
                  </td>
                </tr>
              );
            }
            const tone =
              row.worst.value < row.floor
                ? "bad"
                : row.worst.value < CVD_SEPARATION_COMFORTABLE
                  ? "warn"
                  : "good";
            const others = row.underFloor.slice(1);
            return (
              <tr key={`${row.mode}-${row.role}`}>
                <td>{row.roleLabel}</td>
                <td>{row.mode}</td>
                <td>
                  {row.worst.a} vs {row.worst.b}{" "}
                  <span className="readout">({row.worst.type})</span>
                </td>
                <td>
                  <span className={`pill ${tone} tnum`}>{row.worst.value.toFixed(1)}</span>
                </td>
                <td className="readout tnum">{row.floor}</td>
                <td className="readout">
                  {others.length
                    ? others.map((p) => `${p.a}/${p.b} (${p.value.toFixed(0)})`).join(", ")
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
