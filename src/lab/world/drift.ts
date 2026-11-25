// The status quo outside the CRM: an admin re-types the Salesforce rules into a separate chat tool.
// The world produces that hand-entered copy as XML, with the drifts listed in world.json.

export interface Drift {
  kind: "dropEntry" | "dropBooleanFilter" | "removeValue" | "setValue";
  order: number;
  field?: string;
  value?: string;
  why: string;
}

export function handEnteredXml(exportXml: string, ruleName: string, drifts: Drift[]): string {
  const ruleRe = /<assignmentRule>[\s\S]*?<\/assignmentRule>/g;
  return exportXml.replace(ruleRe, (rule) => {
    if (!rule.includes(`<fullName>${ruleName}</fullName>`)) return rule;
    const entries = rule.match(/<ruleEntry>[\s\S]*?<\/ruleEntry>/g) ?? [];
    const changed = entries.map((entry, i) => {
      const order = i + 1;
      let e: string | null = entry;
      for (const d of drifts.filter((x) => x.order === order)) {
        if (e === null) break;
        if (d.kind === "dropEntry") e = null;
        else if (d.kind === "dropBooleanFilter") e = e.replace(/\s*<booleanFilter>[\s\S]*?<\/booleanFilter>/, "");
        else if (d.kind === "removeValue" || d.kind === "setValue") {
          e = e.replace(/<criteriaItems>[\s\S]*?<\/criteriaItems>/g, (item) => {
            if (!item.includes(`<field>Lead.${d.field}</field>`)) return item;
            return item.replace(/<value>([\s\S]*?)<\/value>/, (_m, v: string) => {
              const next = d.kind === "setValue"
                ? (d.value as string)
                : v.split(",").map((s) => s.trim()).filter((s) => s !== d.value).join(",");
              return `<value>${next}</value>`;
            });
          });
        }
      }
      return e;
    });
    let i = 0;
    return rule.replace(/<ruleEntry>[\s\S]*?<\/ruleEntry>/g, () => changed[i++] ?? "");
  });
}
