// Voice of the customer: the model tags discovery notes with product-gap themes; code counts them.
// A theme is ranked by the pipeline it blocks, then by how many deals raised it.

export interface FeedbackTag {
  dealId: string;
  theme: string;
  pipelineEur: number;
  quote: string;
}

export interface ThemeSummary {
  theme: string;
  deals: number;
  pipelineEur: number;
  quotes: string[];
}

export function summarizeThemes(tags: FeedbackTag[], allowedThemes: string[]): { themes: ThemeSummary[]; rejected: FeedbackTag[] } {
  const allowed = new Set(allowedThemes);
  const rejected: FeedbackTag[] = [];
  const byTheme = new Map<string, { deals: Map<string, number>; quotes: string[] }>();
  for (const t of tags) {
    if (!allowed.has(t.theme)) { rejected.push(t); continue; }
    const slot = byTheme.get(t.theme) ?? { deals: new Map<string, number>(), quotes: [] };
    // A deal counts once per theme, at its largest pipeline value.
    slot.deals.set(t.dealId, Math.max(slot.deals.get(t.dealId) ?? 0, t.pipelineEur));
    if (slot.quotes.length < 3) slot.quotes.push(t.quote);
    byTheme.set(t.theme, slot);
  }
  const themes = Array.from(byTheme.entries()).map(([theme, s]) => ({
    theme,
    deals: s.deals.size,
    pipelineEur: Array.from(s.deals.values()).reduce((a, b) => a + b, 0),
    quotes: s.quotes,
  }));
  themes.sort((a, b) => b.pipelineEur - a.pipelineEur || b.deals - a.deals || a.theme.localeCompare(b.theme));
  return { themes, rejected };
}
