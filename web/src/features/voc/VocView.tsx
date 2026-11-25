import { motion } from "framer-motion";
import { motionTokens } from "../../shared/theme/tokens.ts";
import type { Kit } from "../../shared/types.ts";
import { EmptyState } from "../../shared/ui/States.tsx";
import "./voc.css";

const eur = (x: number): string => `€${Math.round(x / 1000).toLocaleString("en-US")}k`;

export function VocView({ kit }: { kit: Kit }) {
  const { themes, rejected } = kit.voiceOfCustomer;
  if (themes.length === 0) {
    return <EmptyState title="No discovery notes tagged yet">Tagged notes from discovery calls appear here, ranked by the pipeline each gap blocks.</EmptyState>;
  }
  const max = Math.max(...themes.map((t) => t.pipelineEur));
  return (
    <section>
      <div className="view-head">
        <h1>Product feedback, counted rather than remembered</h1>
        <p>
          The model tags discovery notes with a theme; code counts each deal once per theme and ranks themes by the pipeline they
          block. This is the list that goes to product, with the quotes behind each line.
        </p>
      </div>
      <ol className="voc">
        {themes.map((t, i) => (
          <li key={t.theme} className="voc-row">
            <div className="voc-head">
              <h2>{t.theme}</h2>
              <span className="voc-figure">{eur(t.pipelineEur)} in {t.deals} deal{t.deals === 1 ? "" : "s"}</span>
            </div>
            <span className="voc-track">
              <motion.span className="voc-fill" initial={{ scaleX: 0 }} animate={{ scaleX: t.pipelineEur / max }} transition={{ duration: motionTokens.base * 2, delay: i * motionTokens.stagger, ease: motionTokens.ease }} />
            </span>
            <ul className="voc-quotes">{t.quotes.map((q) => <li key={q}>“{q}”</li>)}</ul>
          </li>
        ))}
      </ol>
      {rejected.length > 0 && <p className="voc-foot">{rejected.length} tag{rejected.length === 1 ? " was" : "s were"} outside the agreed theme list and left out: {rejected.map((r) => r.theme).join(", ")}.</p>}
    </section>
  );
}
