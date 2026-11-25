import { motion } from "framer-motion";
import { useState } from "react";
import { motionTokens } from "../../shared/theme/tokens.ts";

interface Row { id: string; label: string; value: number; highlight: boolean }

/** One measure, one axis, horizontal bars. The platform carries the accent; the others stay neutral. */
export function BarChart({ title, note, rows, format }: { title: string; note: string; rows: Row[]; format: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <figure className="bars">
      <figcaption>
        <span className="bars-title">{title}</span>
        <span className="bars-note">{note}</span>
      </figcaption>
      <ul>
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={`bar-row ${r.highlight ? "is-highlight" : ""} ${hover === r.id ? "is-hover" : ""}`}
            onMouseEnter={() => setHover(r.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(r.id)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`${r.label}: ${format(r.value)}`}
          >
            <span className="bar-label">{r.label}</span>
            <span className="bar-track">
              <motion.span
                className="bar-fill"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: r.value / max }}
                transition={{ duration: motionTokens.base * 2, delay: i * motionTokens.stagger, ease: motionTokens.ease }}
              />
            </span>
            <span className="bar-value">{format(r.value)}</span>
            {hover === r.id && <span className="bar-tip" role="tooltip">{r.label}: {format(r.value)}</span>}
          </li>
        ))}
      </ul>
    </figure>
  );
}
