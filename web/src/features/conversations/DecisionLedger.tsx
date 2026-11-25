import { AnimatePresence, motion } from "framer-motion";
import { motionTokens } from "../../shared/theme/tokens.ts";
import type { DemoTurn } from "../../shared/types.ts";

const NEXT: Record<string, string> = {
  ask_consent: "Ask for consent before any personal data",
  ask_email: "Ask for a work email",
  ask_employees: "Ask for company size",
  ask_role: "Ask for the visitor's role",
  ask_country: "Ask for the country",
  booked: "Meeting booked",
  support: "Hand to support",
  nurture: "Offer content, no meeting",
  disqualified: "Not a buyer",
  continue: "Keep answering",
};

const VIA: Record<string, string> = {
  account_owner: "Rules of engagement: account owner",
  rule_entry: "Salesforce assignment rule",
  default_owner: "Default lead owner",
  review: "Human review",
};

export function DecisionLedger({ turn, turnNumber }: { turn: DemoTurn; turnNumber: number }) {
  return (
    <aside className="ledger" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${turnNumber}-${turn.visitor}`}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: motionTokens.quick, ease: motionTokens.ease }}
        >
          <h2 className="ledger-title">Turn {turnNumber}: {NEXT[turn.next] ?? turn.next}</h2>

          <div className="ledger-block">
            <h3>Claim check</h3>
            {turn.recordedDraft && <p className="ledger-note">This draft was recorded from a model run so the check has something to catch.</p>}
            {turn.shown.length === 0 && turn.removed.length === 0 && <p className="ledger-muted">No factual sentences in this reply.</p>}
            <ul className="verdicts">
              {turn.shown.map((v) => (
                <li key={`k-${v.text}`}>
                  <span className="chip chip-kept">kept</span>
                  <p>{v.text}</p>
                  <p className="ledger-muted">{v.reason}</p>
                </li>
              ))}
              {turn.removed.map((v) => (
                <li key={`r-${v.text}`}>
                  <span className="chip chip-removed">removed</span>
                  <p className="struck">{v.text}</p>
                  <p className="ledger-muted">{v.reason}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="ledger-block">
            <h3>Qualification</h3>
            <p><span className="chip chip-code">{turn.decision}</span> {turn.decisionReasons.join("; ")}</p>
          </div>

          <div className="ledger-block">
            <h3>Consent</h3>
            <p>
              <span className={`chip ${turn.consent.mayCollect ? "chip-allowed" : "chip-blocked"}`}>{turn.consent.mayCollect ? "may collect" : "no personal data"}</span>{" "}
              {turn.consent.reason}
            </p>
          </div>

          <div className="ledger-block">
            <h3>Routing</h3>
            {turn.routing ? (
              <>
                <p><strong>{turn.routing.owner}</strong>, via {VIA[turn.routing.via] ?? turn.routing.via}</p>
                <ul className="explain">{turn.routing.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
              </>
            ) : (
              <p className="ledger-muted">Not routed yet. Routing runs once the visitor qualifies and gives a work email.</p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
