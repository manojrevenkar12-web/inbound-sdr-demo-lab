// Lead-to-account matching by domain, from an Account export (CSV with a header row).

export interface AccountRow {
  id: string;
  name: string;
  domain: string;
  ownerId: string;
  type: "Customer" | "Prospect";
  openOpportunity: boolean;
  employees: number | null;
  country: string;
  industry: string;
}

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  if (d.includes("@")) d = d.slice(d.lastIndexOf("@") + 1);
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return d;
}

/** Registrable part for the simple two-label case (eu.acme.com -> acme.com, acme.co.uk stays). */
export function rootDomain(domain: string): string {
  const parts = normalizeDomain(domain).split(".");
  if (parts.length <= 2) return parts.join(".");
  const secondLevel = new Set(["co.uk", "com.au", "co.at", "or.at", "ac.uk", "gv.at"]);
  const lastTwo = parts.slice(-2).join(".");
  if (secondLevel.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

const FREEMAIL = new Set(["gmail.com", "googlemail.com", "gmx.de", "gmx.net", "web.de", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me", "t-online.de"]);

export function isFreemail(email: string | null | undefined): boolean {
  return !!email && FREEMAIL.has(normalizeDomain(email));
}

/** The domain to match an account by: the work email, or the company domain from reverse IP when the email is free-mail. */
export function matchDomain(email: string | null | undefined, companyDomain: string | null | undefined): string | null {
  if (email && !isFreemail(email)) return email;
  return companyDomain ?? null;
}

export function parseCsv(src: string): Record<string, string>[] {
  const lines = src.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = (lines.shift() ?? "").split(",").map((h) => h.trim());
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
      } else if (ch === "," && !quoted) { cells.push(cur); cur = ""; } else cur += ch;
    }
    cells.push(cur);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
    return row;
  });
}

export function parseAccounts(csv: string): AccountRow[] {
  return parseCsv(csv).map((r) => ({
    id: r.Id ?? "",
    name: r.Name ?? "",
    domain: normalizeDomain(r.Website ?? ""),
    ownerId: r.OwnerId ?? "",
    type: r.Type === "Customer" ? "Customer" : "Prospect",
    openOpportunity: (r.Open_Opportunity__c ?? "").toLowerCase() === "true",
    employees: r.NumberOfEmployees ? Number(r.NumberOfEmployees) : null,
    country: r.BillingCountry ?? "",
    industry: r.Industry ?? "",
  }));
}

export class AccountIndex {
  private readonly byDomain = new Map<string, AccountRow>();
  readonly rows: AccountRow[];
  constructor(rows: AccountRow[]) {
    this.rows = rows;
    for (const a of rows) if (a.domain) this.byDomain.set(rootDomain(a.domain), a);
  }
  match(domainOrEmail: string | null | undefined): AccountRow | null {
    if (!domainOrEmail) return null;
    return this.byDomain.get(rootDomain(domainOrEmail)) ?? null;
  }
}
