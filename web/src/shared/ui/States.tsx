import type { ReactNode } from "react";
import "./states.css";

export function Skeleton({ lines = 4, label }: { lines?: number; label: string }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton-line" style={{ inlineSize: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <h3>The demo data did not load</h3>
      <p>{message}. Run <code>npm run demo</code> and <code>npm run report</code> in the repository, then try again.</p>
      <button type="button" className="button" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="state state-empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
