// Country names as Salesforce stores them, and the privacy region each one falls in.

const ALIASES: Record<string, string> = {
  deutschland: "Germany", germany: "Germany", de: "Germany",
  österreich: "Austria", oesterreich: "Austria", austria: "Austria", at: "Austria",
  schweiz: "Switzerland", suisse: "Switzerland", switzerland: "Switzerland", ch: "Switzerland",
  sverige: "Sweden", sweden: "Sweden", se: "Sweden",
  norge: "Norway", norway: "Norway", no: "Norway",
  danmark: "Denmark", denmark: "Denmark", dk: "Denmark",
  suomi: "Finland", finland: "Finland", fi: "Finland",
  "united kingdom": "United Kingdom", uk: "United Kingdom", gb: "United Kingdom", england: "United Kingdom", britain: "United Kingdom",
  ireland: "Ireland", ie: "Ireland",
  netherlands: "Netherlands", nederland: "Netherlands", nl: "Netherlands",
  france: "France", fr: "France", belgium: "Belgium", be: "Belgium",
  spain: "Spain", españa: "Spain", es: "Spain", italy: "Italy", italia: "Italy", it: "Italy",
  poland: "Poland", polska: "Poland", pl: "Poland",
  "united states": "United States", usa: "United States", us: "United States",
  canada: "Canada", ca: "Canada", india: "India", in: "India",
};

export const COUNTRY_NAMES = Array.from(new Set(Object.values(ALIASES)));

export function canonicalCountry(input: string | null | undefined): string | null {
  if (!input) return null;
  return ALIASES[input.trim().toLowerCase()] ?? null;
}

const EU = new Set([
  "Germany", "Austria", "Sweden", "Denmark", "Finland", "Ireland", "Netherlands", "France", "Belgium", "Spain", "Italy", "Poland",
]);
const EEA_ONLY = new Set(["Norway", "Iceland", "Liechtenstein"]);

export type PrivacyRegion = "EU" | "EEA" | "UK" | "CH" | "OTHER";

export function privacyRegion(country: string | null | undefined): PrivacyRegion {
  if (!country) return "OTHER";
  if (EU.has(country)) return "EU";
  if (EEA_ONLY.has(country)) return "EEA";
  if (country === "United Kingdom") return "UK";
  if (country === "Switzerland") return "CH";
  return "OTHER";
}
