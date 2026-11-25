import { motion } from "framer-motion";
import { motionTokens } from "../../shared/theme/tokens.ts";
import type { Kit } from "../../shared/types.ts";
import { EmptyState } from "../../shared/ui/States.tsx";
import "./security.css";

export function SecurityView({ kit }: { kit: Kit }) {
  const q = kit.questionnaire;
  if (q.length === 0) {
    return <EmptyState title="No questionnaire for this prospect">Add questions to <code>config/demo/{kit.prospect}/script.json</code> to see which answers the evidence supports.</EmptyState>;
  }
  const auto = q.filter((x) => x.status === "auto").length;
  return (
    <section>
      <div className="view-head">
        <h1>Security questionnaire, answered from evidence</h1>
        <p>
          {auto} of {q.length} answers can go out as drafted. The others go to the evidence owner with the reason: evidence that
          expired, a document not approved for customers, or no evidence at all. Nothing is answered from memory.
        </p>
      </div>
      <ol className="sq-list">
        {q.map((a, i) => (
          <motion.li
            key={a.questionId}
            className="sq"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: motionTokens.base, delay: i * motionTokens.stagger }}
          >
            <p className="sq-question">{a.question}</p>
            <div className="sq-answer">
              {a.status === "auto" ? (
                <>
                  <span className="chip chip-kept">send</span>
                  <p>{a.answer}</p>
                  <p className="sq-meta">Evidence: {a.citations.join(", ")}</p>
                </>
              ) : (
                <>
                  <span className="chip chip-partial">to {a.routeTo}</span>
                  <p className="sq-meta">{a.reasons.join("; ")}</p>
                </>
              )}
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
