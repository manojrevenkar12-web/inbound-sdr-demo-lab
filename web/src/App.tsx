import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ConversationsView } from "./features/conversations/ConversationsView.tsx";
import { ResultsView } from "./features/results/ResultsView.tsx";
import { RoutingView } from "./features/routing/RoutingView.tsx";
import { SecurityView } from "./features/security/SecurityView.tsx";
import { VocView } from "./features/voc/VocView.tsx";
import { useJson } from "./shared/data/useJson.ts";
import { motionTokens } from "./shared/theme/tokens.ts";
import type { Kit, KitIndexEntry } from "./shared/types.ts";
import { EmptyState, ErrorState, Skeleton } from "./shared/ui/States.tsx";
import "./app.css";

const SECTIONS = [
  { id: "conversations", label: "Conversations" },
  { id: "routing", label: "Routing" },
  { id: "security", label: "Security review" },
  { id: "results", label: "Results" },
  { id: "voc", label: "Product feedback" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

function readHash(): { prospect: string | null; section: Section } {
  const [p, s] = window.location.hash.replace(/^#\/?/, "").split("/");
  const section = (SECTIONS.find((x) => x.id === s)?.id ?? "conversations") as Section;
  return { prospect: p || null, section };
}

export function App() {
  const index = useJson<KitIndexEntry[]>("/kits/index.json");
  const [{ prospect, section }, setRoute] = useState(readHash);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const current = prospect ?? (index.status === "ready" ? index.data[0]?.prospect ?? null : null);
  const kit = useJson<Kit>(current ? `/kits/${current}.json` : null);
  const go = (p: string | null, s: Section) => { window.location.hash = `/${p ?? ""}/${s}`; };

  useEffect(() => {
    if (kit.status !== "ready") return;
    document.documentElement.style.setProperty("--brand", kit.data.brand.primary);
    document.documentElement.style.setProperty("--brand-accent", kit.data.brand.accent);
  }, [kit]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="shell">
        <header className="topbar">
          <div className="wordmark">
            <span className="wordmark-name">Inbound SDR demo console</span>
            <span className="wordmark-sub">for an EMEA rollout, one prospect at a time</span>
          </div>
          {index.status === "ready" && index.data.length > 0 && (
            <nav className="prospects" aria-label="Prospect">
              {index.data.map((p) => (
                <button key={p.prospect} type="button" className="prospect" aria-pressed={p.prospect === current} onClick={() => go(p.prospect, section)}>
                  {p.company}
                </button>
              ))}
            </nav>
          )}
        </header>

        <nav className="sections" aria-label="Section">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className="section-tab" aria-current={s.id === section ? "page" : undefined} onClick={() => go(current, s.id)}>
              {s.label}
              {s.id === section && <motion.span layoutId="tab-underline" className="section-underline" transition={{ duration: motionTokens.base, ease: motionTokens.ease }} />}
            </button>
          ))}
        </nav>

        <main className="content">
          {index.status === "loading" && <Skeleton label="Loading prospects" />}
          {index.status === "error" && <ErrorState message={index.message} onRetry={index.retry} />}
          {index.status === "ready" && index.data.length === 0 && (
            <EmptyState title="No demo kits yet">Add a prospect under <code>config/demo/</code> and run <code>npm run demo</code>.</EmptyState>
          )}
          {index.status === "ready" && index.data.length > 0 && (
            <>
              {section !== "results" && kit.status === "loading" && <Skeleton label="Loading the demo kit" lines={6} />}
              {section !== "results" && kit.status === "error" && <ErrorState message={kit.message} onRetry={kit.retry} />}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${current}-${section}-${kit.status}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: motionTokens.base, ease: motionTokens.ease }}
                >
                  {section === "results" && <ResultsView />}
                  {section !== "results" && kit.status === "ready" && (
                    <>
                      {section === "conversations" && <ConversationsView kit={kit.data} />}
                      {section === "routing" && <RoutingView kit={kit.data} />}
                      {section === "security" && <SecurityView kit={kit.data} />}
                      {section === "voc" && <VocView kit={kit.data} />}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </main>
      </div>
    </MotionConfig>
  );
}
