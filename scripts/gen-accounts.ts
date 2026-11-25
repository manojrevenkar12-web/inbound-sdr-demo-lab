// Writes the demo orgs' Account exports. Run once; the CSVs are committed so the platform reads a fixed export.
// node scripts/gen-accounts.ts

import { writeFileSync } from "node:fs";
import { Stream } from "../src/lab/rng.ts";

interface Market { country: string; tld: string; suffix: string[]; owners: { strategic: string[]; mid: string[] } }

function generate(prospect: string, markets: Market[], publicSector: string, count: number, path: string): void {
  const s = new Stream(`accounts:${prospect}`);
  const a = ["Al", "Bern", "Cor", "Dor", "Eis", "Fal", "Gran", "Hel", "Ist", "Jor", "Kal", "Lun", "Mar", "Nor", "Ost", "Pal", "Quell", "Rhe", "Sol", "Tal", "Ulm", "Vel", "Wes", "Zen"];
  const b = ["bach", "berg", "dorf", "feld", "hain", "heim", "kamp", "lund", "mark", "stein", "tal", "vik", "werk", "wald", "holm", "stad"];
  const c = ["Logistik", "Energie", "Pharma", "Retail", "Maschinenbau", "Foods", "Media", "Systems", "Mobility", "Health", "Chemicals", "Textiles"];
  const industries = ["Manufacturing", "Retail", "Healthcare", "Technology", "Logistics", "Energy", "Media", "Government", "Education", "Financial Services"];
  const rows = ["Id,Name,Website,OwnerId,Type,Open_Opportunity__c,NumberOfEmployees,BillingCountry,Industry"];
  const seen = new Set<string>();
  let i = 0;
  while (rows.length <= count) {
    const m = s.pick(markets);
    const root = `${s.pick(a)}${s.pick(b)}`;
    const sector = s.pick(c);
    const name = `${root} ${sector} ${s.pick(m.suffix)}`;
    const domain = `${root.toLowerCase()}-${sector.toLowerCase()}.${m.tld}`;
    if (seen.has(domain)) continue;
    seen.add(domain);
    const employees = Math.round(s.logNormal(450, 1.1));
    const industry = s.next() < 0.06 ? s.pick(["Government", "Education"]) : s.pick(industries);
    const customer = s.next() < 0.35;
    const openOpp = !customer && s.next() < 0.3;
    const owner = m.country === "Germany" && (industry === "Government" || industry === "Education") && employees < 1000
      ? publicSector
      : employees >= 1000 ? s.pick(m.owners.strategic) : s.pick(m.owners.mid);
    const website = s.next() < 0.4 ? `https://www.${domain}` : domain;
    i++;
    rows.push([`001NW${String(i).padStart(6, "0")}`, `"${name}"`, website, owner, customer ? "Customer" : "Prospect", String(openOpp), String(employees), m.country, industry].join(","));
  }
  writeFileSync(path, rows.join("\n") + "\n");
}

const nw = "northwind.example";
const dach = (country: string, tld: string, suffix: string[]): Market => ({
  country, tld, suffix,
  owners: { strategic: [`anna.becker@${nw}`, `jonas.koch@${nw}`], mid: [`lea.wolf@${nw}`, `tim.braun@${nw}`, `nina.hoff@${nw}`] },
});
generate("northwind", [
  dach("Germany", "de", ["GmbH", "AG", "SE", "GmbH & Co. KG"]),
  dach("Germany", "de", ["GmbH", "AG"]),
  dach("Austria", "at", ["GmbH", "AG"]),
  dach("Switzerland", "ch", ["AG", "SA"]),
  { country: "Sweden", tld: "se", suffix: ["AB"], owners: { strategic: [`sofia.lind@${nw}`], mid: [`sofia.lind@${nw}`] } },
  { country: "United Kingdom", tld: "co.uk", suffix: ["Ltd", "plc"], owners: { strategic: [`oliver.grant@${nw}`], mid: [`emma.hale@${nw}`] } },
], `markus.weber@${nw}`, 360, new URL("../config/demo/northwind/salesforce/accounts.csv", import.meta.url).pathname);

const ks = "kestrel.example";
generate("kestrel", [
  { country: "Germany", tld: "de", suffix: ["GmbH", "SE"], owners: { strategic: [`henrik.vogt@${ks}`], mid: [`clara.neumann@${ks}`, `paul.richter@${ks}`] } },
  { country: "Netherlands", tld: "nl", suffix: ["B.V."], owners: { strategic: [`sanne.devries@${ks}`], mid: [`sanne.devries@${ks}`] } },
  { country: "Poland", tld: "pl", suffix: ["sp. z o.o."], owners: { strategic: [`marta.nowak@${ks}`], mid: [`marta.nowak@${ks}`] } },
], `henrik.vogt@${ks}`, 160, new URL("../config/demo/kestrel/salesforce/accounts.csv", import.meta.url).pathname);
console.log("accounts written");
