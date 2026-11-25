import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import type { RoutingDecision } from "@core/routing/router.ts";
import { motionTokens } from "../../shared/theme/tokens.ts";
import type { Kit } from "../../shared/types.ts";

interface Jack { key: string; label: string; sub: string }

function ownerLabel(kit: Kit, type: string, id: string): Jack {
  if (type === "User") {
    const u = kit.router.users[id];
    return { key: `User:${id}`, label: u?.name ?? id, sub: u?.role ?? "named user" };
  }
  const members = (kit.router.queues[id] ?? []).map((m) => kit.router.users[m]?.name ?? m);
  return { key: `Queue:${id}`, label: id.replace(/_/g, " "), sub: members.length ? members.join(", ") : "queue" };
}

/** The rule entries are jacks on the left, owners on the right; a cord connects the deciding jack to its owner. */
export function PatchPanel({ kit, decision, perEntry }: { kit: Kit; decision: RoutingDecision; perEntry: (boolean | null)[] }) {
  const plan = kit.routingPlan.entries;
  const owners: Jack[] = [];
  const seen = new Set<string>();
  const add = (j: Jack) => { if (!seen.has(j.key)) { seen.add(j.key); owners.push(j); } };
  add({ key: "account_owner", label: decision.via === "account_owner" ? ownerLabel(kit, "User", decision.owner.id).label : "Account owner", sub: "customers and open opportunities" });
  for (const e of kit.router.rule.entries) add(ownerLabel(kit, e.assignedTo.type, e.assignedTo.id));
  add(ownerLabel(kit, kit.router.defaultOwner.type, kit.router.defaultOwner.id));
  add({ key: `Queue:${kit.router.reviewQueue}`, label: "Human review", sub: "a person assigns it the next working morning" });

  const fromKey = decision.via === "account_owner" ? "roe" : decision.via === "rule_entry" || (decision.via === "review" && decision.entryOrder) ? `entry-${decision.entryOrder}` : decision.via === "review" ? "end" : "end";
  const toKey = decision.via === "account_owner" ? "account_owner" : `${decision.owner.type}:${decision.owner.id}`;

  const box = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<string | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const root = box.current;
      if (!root) return;
      const a = root.querySelector<HTMLElement>(`[data-jack="${fromKey}"]`);
      const b = root.querySelector<HTMLElement>(`[data-owner="${CSS.escape(toKey)}"]`);
      if (!a || !b) { setPath(null); return; }
      const r = root.getBoundingClientRect();
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x1 = ra.right - r.left, y1 = ra.top + ra.height / 2 - r.top;
      const x2 = rb.left - r.left, y2 = rb.top + rb.height / 2 - r.top;
      const sag = Math.min(80, Math.abs(y2 - y1) / 3 + 24);
      setPath(`M ${x1} ${y1} C ${x1 + (x2 - x1) * 0.45} ${y1 + sag}, ${x2 - (x2 - x1) * 0.45} ${y2 + sag}, ${x2} ${y2}`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fromKey, toKey, kit.prospect]);

  const decidingOrder = decision.entryOrder ?? null;
  const rowState = (i: number): "match" | "miss" | "unknown" | "skipped" => {
    const order = i + 1;
    if (decision.via === "account_owner") return "skipped";
    if (decidingOrder !== null && order > decidingOrder) return "skipped";
    const v = perEntry[i];
    if (v === null || v === undefined) return "unknown";
    if (order === decidingOrder && decision.via === "rule_entry") return "match";
    return v ? "match" : "miss";
  };

  return (
    <div className="patch" ref={box}>
      <div className="jacks">
        <h2>{kit.routingPlan.rule}</h2>
        <div className={`jack jack-roe ${decision.via === "account_owner" ? "is-match" : ""}`} data-jack="roe">
          <span className="jack-order" aria-hidden="true">0</span>
          <span className="jack-body">
            <span className="jack-when">Rules of engagement: {kit.router.routeToAccountOwnerWhen.join(" or ")} accounts stay with their owner</span>
          </span>
          <span className="jack-plug" aria-hidden="true" />
        </div>
        <ol className="jack-list">
          {plan.map((e, i) => {
            const st = rowState(i);
            return (
              <li key={e.order} className={`jack is-${st}`} data-jack={`entry-${e.order}`}>
                <span className="jack-order">{e.order}</span>
                <span className="jack-body">
                  <span className="jack-when">{e.when}</span>
                  {e.status !== "imported" && <span className={`chip chip-${e.status}`}>{e.status}: {e.note}</span>}
                  <span className="visually-hidden">{st === "unknown" ? "cannot be evaluated for this lead" : st}</span>
                </span>
                <span className="jack-plug" aria-hidden="true" />
              </li>
            );
          })}
        </ol>
        <div className="jack is-end" data-jack="end">
          <span className="jack-order" aria-hidden="true">·</span>
          <span className="jack-body"><span className="jack-when">No entry matched, or an entry could not be evaluated</span></span>
          <span className="jack-plug" aria-hidden="true" />
        </div>
      </div>

      <ul className="owners" aria-label="Owners">
        {owners.map((o) => (
          <li key={o.key} className={`owner ${o.key === toKey ? "is-target" : ""}`} data-owner={o.key}>
            <span className="owner-plug" aria-hidden="true" />
            <span className="owner-name">{o.label}</span>
            <span className="owner-sub">{o.sub}</span>
          </li>
        ))}
      </ul>

      {path && (
        <svg className="cord" aria-hidden="true">
          <motion.path
            key={`${fromKey}->${toKey}`}
            d={path}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: motionTokens.cord, ease: motionTokens.ease }}
          />
        </svg>
      )}

      <div className="decision" role="status">
        <p className="decision-owner">{decision.via === "review" ? "Human review" : ownerLabel(kit, decision.owner.type, decision.owner.id).label}</p>
        <ul>{decision.explanation.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
    </div>
  );
}
