import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { motionTokens } from "../../shared/theme/tokens.ts";
import type { Kit } from "../../shared/types.ts";
import { EmptyState } from "../../shared/ui/States.tsx";
import { DecisionLedger } from "./DecisionLedger.tsx";
import "./conversations.css";

export function ConversationsView({ kit }: { kit: Kit }) {
  const [convIndex, setConvIndex] = useState(0);
  const [turnIndex, setTurnIndex] = useState(0);
  if (kit.conversations.length === 0) {
    return <EmptyState title="No scripted conversations for this prospect">Add visitors to <code>config/demo/{kit.prospect}/script.json</code> and rebuild the kit.</EmptyState>;
  }
  const conv = kit.conversations[convIndex] ?? kit.conversations[0];
  if (!conv) return null;
  const turn = conv.turns[turnIndex] ?? conv.turns[0];

  return (
    <section>
      <div className="view-head">
        <h1>What the visitor sees, and what code decided</h1>
        <p>
          Each reply below came out of the same turn logic the service runs. The model only read the message and drafted sentences;
          the ledger on the right shows every decision code made before the reply went out.
        </p>
      </div>

      <div className="conv-layout">
        <ol className="scenarios" aria-label="Visitors">
          {kit.conversations.map((c, i) => (
            <li key={c.id}>
              <button type="button" className="scenario" aria-pressed={i === convIndex} onClick={() => { setConvIndex(i); setTurnIndex(0); }}>
                <span className="scenario-title">{c.title}</span>
                <span className="scenario-meta">{c.country}, consent banner {c.cmp === "unset" ? "not answered" : c.cmp}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="widget" aria-label={`${kit.company} website chat`}>
          <div className="widget-bar">
            <span className="widget-dot" aria-hidden="true" />
            <span>{kit.company}</span>
          </div>
          <ol className="transcript">
            <AnimatePresence initial={false}>
              {conv.turns.map((t, i) => (
                <motion.li
                  key={`${conv.id}-${i}`}
                  className="exchange"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: motionTokens.base, delay: i * motionTokens.stagger, ease: motionTokens.ease }}
                >
                  <p className="bubble bubble-visitor">{t.visitor}</p>
                  <button type="button" className="bubble bubble-agent" aria-pressed={i === turnIndex} onClick={() => setTurnIndex(i)}>
                    {t.reply || <em>No reply needed.</em>}
                    <span className="bubble-hint">{i === turnIndex ? "Shown in the ledger" : "Show decisions"}</span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>

        {turn ? <DecisionLedger turn={turn} turnNumber={turnIndex + 1} /> : <EmptyState title="No turns">This visitor sent no messages.</EmptyState>}
      </div>
    </section>
  );
}
