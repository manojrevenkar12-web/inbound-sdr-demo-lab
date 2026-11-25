import { useState } from "react";
import { useJson } from "../../shared/data/useJson.ts";
import type { DesignMetrics, ResultsFile } from "../../shared/types.ts";
import { EmptyState, ErrorState, Skeleton } from "../../shared/ui/States.tsx";
import { BarChart } from "./BarChart.tsx";
import "./results.css";

const MAIN = ["form_and_wait", "rules_chatbot", "model_alone", "platform"];

export function ResultsView() {
  const res = useJson<ResultsFile>("/data/results.json");
  const [table, setTable] = useState(false);
  if (res.status === "loading") return <Skeleton label="Loading results" lines={8} />;
  if (res.status === "error") return <ErrorState message={res.message} onRetry={res.retry} />;
  const r = res.data;
  const designs = MAIN.map((d) => r.dev.conversations[d]).filter((m): m is DesignMetrics => !!m);
  if (designs.length === 0) return <EmptyState title="No results yet">Run <code>npm run lab:dev</code> and <code>npm run report</code>.</EmptyState>;

  const metric = (key: keyof DesignMetrics, scale = 1) => designs.map((m) => ({ id: m.design, label: m.label, value: (m[key] as number) * scale, highlight: m.design === "platform" }));
  const passed = r.gates.dev.filter((g) => g.pass).length;
  const heldPassed = r.gates.heldout?.filter((g) => g.pass).length ?? null;

  return (
    <section>
      <div className="view-head">
        <h1>Measured in the lab</h1>
        <p>
          {r.dev.sessions.toLocaleString("en-US")} simulated engaged sessions per design on dev seeds {r.dev.seeds.join(", ")}, the same
          visitors and the same luck for every design. Gates: {passed} of {r.gates.dev.length} pass on dev
          {heldPassed !== null ? `, ${heldPassed} of ${r.gates.heldout?.length} on held-out seeds run once` : ", held-out not run"}.
          These are simulation results, not a customer deployment.
        </p>
      </div>

      <dl className="figures">
        {r.headline.map((h) => (
          <div key={h.label} className="figure">
            <dt>{h.label}</dt>
            <dd className="figure-value">{h.value}</dd>
            <dd className="figure-note">{h.note}</dd>
          </div>
        ))}
      </dl>

      <div className="charts-head">
        <h2>Four ways to work an inbound visitor</h2>
        <button type="button" className="button" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? "Show charts" : "Show as table"}</button>
      </div>

      {table ? (
        <table className="results-table">
          <thead><tr><th>Design</th><th>Qualified meetings / 1k</th><th>Junk meetings</th><th>Wrong owner</th><th>Unsupported claims / 1k answers</th><th>Consent violations / 1k</th></tr></thead>
          <tbody>
            {designs.map((m) => (
              <tr key={m.design}>
                <th scope="row">{m.label}</th>
                <td>{m.qualifiedMeetingsPer1k}</td>
                <td>{(m.junkMeetingShare * 100).toFixed(1)}%</td>
                <td>{(m.wrongOwnerShare * 100).toFixed(1)}%</td>
                <td>{m.unsupportedClaimsPer1kAnswers}</td>
                <td>{m.consentViolationsPer1kOptIn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="charts">
          <BarChart title="Qualified meetings per 1,000 sessions" note="Higher is better" rows={metric("qualifiedMeetingsPer1k")} format={(v) => v.toFixed(1)} />
          <BarChart title="Booked meetings outside the ICP" note="Lower is better" rows={metric("junkMeetingShare", 100)} format={(v) => `${v.toFixed(1)}%`} />
          <BarChart title="Meetings with the wrong owner" note="Lower is better" rows={metric("wrongOwnerShare", 100)} format={(v) => `${v.toFixed(1)}%`} />
          <BarChart title="Unsupported claims per 1,000 answers" note="Lower is better" rows={metric("unsupportedClaimsPer1kAnswers")} format={(v) => v.toFixed(1)} />
          <BarChart title="Personal data without consent, per 1,000 opt-in sessions" note="Lower is better" rows={metric("consentViolationsPer1kOptIn")} format={(v) => v.toFixed(1)} />
        </div>
      )}

      <h2 className="gates-head">Gates, frozen before the held-out run</h2>
      <ul className="gates">
        {r.gates.dev.map((g) => {
          const h = r.gates.heldout?.find((x) => x.id === g.id);
          return (
            <li key={g.id}>
              <span className={`chip ${g.pass ? "chip-kept" : "chip-removed"}`}>{g.pass ? "dev pass" : "dev fail"}</span>
              {h && <span className={`chip ${h.pass ? "chip-kept" : "chip-removed"}`}>{h.pass ? "held-out pass" : "held-out fail"}</span>}
              <span>{g.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
