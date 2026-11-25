import type { Kit } from "../../shared/types.ts";

export interface LeadInput {
  country: string;
  employees: number;
  industry: string;
  email: string;
  companyDomain: string;
  partner: boolean;
}

const COUNTRIES = ["Germany", "Austria", "Switzerland", "Netherlands", "Belgium", "Poland", "Sweden", "Norway", "Denmark", "Finland", "United Kingdom", "Ireland", "France", "United States"];
const INDUSTRIES = ["Manufacturing", "Retail", "Healthcare", "Technology", "Logistics", "Energy", "Media", "Government", "Education", "Financial Services"];

export function LeadForm({ kit, value, onChange }: { kit: Kit; value: LeadInput; onChange: (v: LeadInput) => void }) {
  const set = <K extends keyof LeadInput>(k: K, v: LeadInput[K]) => onChange({ ...value, [k]: v });
  return (
    <form className="lead-form" onSubmit={(e) => e.preventDefault()} aria-label="Try a lead">
      <h2>Try a lead</h2>
      <label>
        Country
        <select value={value.country} onChange={(e) => set("country", e.target.value)}>
          {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label>
        Employees
        <input type="number" min={1} value={value.employees} onChange={(e) => set("employees", Math.max(1, Number(e.target.value) || 1))} />
      </label>
      <label>
        Industry
        <select value={value.industry} onChange={(e) => set("industry", e.target.value)}>
          {INDUSTRIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label>
        Work email
        <input type="email" value={value.email} onChange={(e) => set("email", e.target.value)} />
      </label>
      <label>
        Company domain from reverse IP
        <select value={value.companyDomain} onChange={(e) => set("companyDomain", e.target.value)}>
          <option value="">Not identified</option>
          {kit.router.sampleDomains.map((d) => (
            <option key={d.domain} value={d.domain}>{d.name} ({d.type}{d.openOpportunity ? ", open opportunity" : ""})</option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={value.partner} onChange={(e) => set("partner", e.target.checked)} />
        Referred by a partner
      </label>
      <p className="lead-form-hint">A free-mail address falls back to the company domain for account matching.</p>
    </form>
  );
}
