// Small, predictable text tools shared by retrieval and the claim check.

const STOP = new Set(
  ("a an the and or but if then so to of in on at by for with from as is are was were be been being it its this that these those " +
    "there here which who whom what when where how can could would should will shall may might must do does did done not no yes " +
    "you your yours i me my mine he she they them their our ours we us also very just about into over under than too more most such " +
    "each other some any per via up out off has have had having get gets got let lets").split(" "),
);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.\-/]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu) ?? []).map((t) => t.replace(/[.]+$/, ""));
}

export function stem(t: string): string {
  if (/\d/.test(t) || t.length <= 4) return t;
  for (const suf of ["ations", "ation", "ings", "ing", "ies", "ed", "es", "s"]) {
    if (t.endsWith(suf) && t.length - suf.length >= 3) {
      return suf === "ies" ? t.slice(0, -3) + "y" : t.slice(0, -suf.length);
    }
  }
  return t;
}

export function contentTerms(text: string): string[] {
  return tokens(text).filter((t) => !STOP.has(t)).map(stem);
}

export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
}

/** Capitalised words that are not the first word of the sentence: product, place and standard names. */
export function namesIn(sentence: string): { word: string; stem: string }[] {
  const words = sentence.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
  return words.slice(1).filter((w) => /^\p{Lu}/u.test(w) && w.length > 1).map((w) => ({ word: w, stem: stem(w.toLowerCase()) }));
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\d"])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}
