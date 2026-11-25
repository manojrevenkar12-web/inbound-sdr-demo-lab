// A deliberately small subset of the Salesforce formula language.
// Anything outside it is refused at import, never approximated.

import type { FormulaNode, LeadRecord } from "./types.ts";

type Token = { t: "ident" | "str" | "num" | "(" | ")" | "," | "=" | "!=" ; v: string };

const FIELD = /^[A-Za-z][A-Za-z0-9_]*(__c)?$/;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) { i++; continue; }
    if (c === "(" || c === ")" || c === ",") { out.push({ t: c, v: c }); i++; continue; }
    if (c === "=") { out.push({ t: "=", v: "=" }); i += src[i + 1] === "=" ? 2 : 1; continue; }
    if (c === "!" && src[i + 1] === "=") { out.push({ t: "!=", v: "!=" }); i += 2; continue; }
    if (c === "<" && src[i + 1] === ">") { out.push({ t: "!=", v: "!=" }); i += 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        // Salesforce string escapes: \\ is one backslash, \" is a quote.
        if (src[j] === "\\" && j + 1 < src.length) { s += src[j + 1]; j += 2; continue; }
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new Error("unterminated string");
      out.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: num[0] }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i));
    if (id) { out.push({ t: "ident", v: id[0] }); i += id[0].length; continue; }
    throw new Error(`unexpected character '${c}'`);
  }
  return out;
}

class Parser {
  private pos = 0;
  private readonly toks: Token[];
  constructor(toks: Token[]) { this.toks = toks; }

  parse(): FormulaNode {
    const node = this.expr();
    if (this.pos !== this.toks.length) throw new Error("trailing tokens");
    return node;
  }

  private peek(): Token | undefined { return this.toks[this.pos]; }
  private take(t?: Token["t"]): Token {
    const tok = this.toks[this.pos];
    if (!tok || (t && tok.t !== t)) throw new Error(`expected ${t ?? "token"}`);
    this.pos++;
    return tok;
  }

  private expr(): FormulaNode {
    const tok = this.take("ident");
    const name = tok.v.toUpperCase();
    if (this.peek()?.t === "(") {
      this.take("(");
      const args: FormulaNode[] = [];
      if (name === "ISBLANK") {
        const field = this.field();
        this.take(")");
        return { kind: "isblank", field };
      }
      if (name === "ISPICKVAL") {
        const field = this.field();
        this.take(",");
        const value = this.take("str").v;
        this.take(")");
        return { kind: "ispickval", field, value };
      }
      if (name === "REGEX") {
        const field = this.field();
        this.take(",");
        const pattern = this.take("str").v;
        this.take(")");
        return { kind: "regex", field, pattern: safePattern(pattern) };
      }
      if (name !== "AND" && name !== "OR" && name !== "NOT") {
        throw new Error(`function ${name} is outside the supported formula subset`);
      }
      args.push(this.expr());
      while (this.peek()?.t === ",") { this.take(","); args.push(this.expr()); }
      this.take(")");
      if (name === "NOT") {
        if (args.length !== 1) throw new Error("NOT takes one argument");
        return { kind: "not", arg: args[0] as FormulaNode };
      }
      return { kind: name === "AND" ? "and" : "or", args };
    }
    if (name === "TRUE" || name === "FALSE") return { kind: "const", value: name === "TRUE" };
    const field = this.checkField(tok.v);
    const op = this.peek();
    if (op && (op.t === "=" || op.t === "!=")) {
      this.take();
      const rhs = this.take();
      let value: string | number | boolean;
      if (rhs.t === "str") value = rhs.v;
      else if (rhs.t === "num") value = Number(rhs.v);
      else if (rhs.t === "ident" && /^(true|false)$/i.test(rhs.v)) value = rhs.v.toLowerCase() === "true";
      else throw new Error("comparison needs a literal on the right");
      const eq: FormulaNode = { kind: "eq", field, value };
      return op.t === "=" ? eq : { kind: "not", arg: eq };
    }
    return { kind: "checkbox", field };
  }

  private field(): string { return this.checkField(this.take("ident").v); }
  private checkField(v: string): string {
    const f = v.startsWith("Lead.") ? v.slice(5) : v;
    if (f.includes(".")) throw new Error(`cross-object field ${v} is outside the supported formula subset`);
    if (!FIELD.test(f)) throw new Error(`bad field ${v}`);
    return f;
  }
}

/**
 * Salesforce REGEX uses Java syntax. The subset below means the same thing in JavaScript;
 * lookarounds, backreferences, possessive quantifiers and inline flags are refused.
 */
export function safePattern(p: string): string {
  if (p.length > 200) throw new Error("REGEX pattern longer than 200 characters");
  if (/\(\?/.test(p)) throw new Error("REGEX groups with (? are outside the supported subset");
  if (/\\[1-9kpPQEGzZAbB]/.test(p)) throw new Error("REGEX escape outside the supported subset");
  if (/[*+?}][+]/.test(p)) throw new Error("possessive quantifiers are outside the supported subset");
  try { new RegExp(p); } catch { throw new Error("REGEX pattern does not compile"); }
  return p;
}

export function parseFormula(src: string): FormulaNode {
  return new Parser(tokenize(src)).parse();
}

function blank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function evalFormula(node: FormulaNode, lead: LeadRecord): boolean {
  switch (node.kind) {
    case "const": return node.value;
    case "and": return node.args.every((a) => evalFormula(a, lead));
    case "or": return node.args.some((a) => evalFormula(a, lead));
    case "not": return !evalFormula(node.arg, lead);
    case "isblank": return blank(lead[node.field]);
    case "checkbox": return lead[node.field] === true || lead[node.field] === "true";
    case "ispickval": {
      const v = lead[node.field];
      return typeof v === "string" && v.toLowerCase() === node.value.toLowerCase();
    }
    case "regex": {
      const v = lead[node.field];
      if (blank(v)) return false;
      return new RegExp(`^(?:${node.pattern})$`).test(String(v));
    }
    case "eq": {
      const v = lead[node.field];
      if (typeof node.value === "number") return typeof v === "number" ? v === node.value : Number(v) === node.value;
      if (typeof node.value === "boolean") return (v === true || v === "true") === node.value;
      return typeof v === "string" && v.toLowerCase() === node.value.toLowerCase();
    }
  }
}
