// Salesforce lead assignment rules as the core understands them after import.

export type Operation =
  | "equals"
  | "notEqual"
  | "greaterThan"
  | "greaterOrEqual"
  | "lessThan"
  | "lessOrEqual"
  | "contains"
  | "notContain"
  | "startsWith";

export const SUPPORTED_OPERATIONS: readonly Operation[] = [
  "equals",
  "notEqual",
  "greaterThan",
  "greaterOrEqual",
  "lessThan",
  "lessOrEqual",
  "contains",
  "notContain",
  "startsWith",
];

export interface Criterion {
  /** 1-based position, the number a booleanFilter refers to. */
  index: number;
  field: string;
  operation: Operation;
  values: string[];
  /** Set when this one criterion cannot be evaluated. It counts as "unknown", never as true or false. */
  unsupported?: string;
}

export type FormulaNode =
  | { kind: "and" | "or"; args: FormulaNode[] }
  | { kind: "not"; arg: FormulaNode }
  | { kind: "isblank"; field: string }
  | { kind: "ispickval"; field: string; value: string }
  | { kind: "checkbox"; field: string }
  | { kind: "eq"; field: string; value: string | number | boolean }
  | { kind: "regex"; field: string; pattern: string }
  | { kind: "const"; value: boolean };

export interface Owner {
  type: "Queue" | "User";
  id: string;
}

export interface RuleEntry {
  order: number;
  assignedTo: Owner;
  criteria: Criterion[];
  booleanFilter?: string;
  formula?: FormulaNode;
  formulaSource?: string;
  /** Set when the importer cannot evaluate this entry at all. The router never guesses past it. */
  refusal?: string;
  /** Criteria that could not be imported; the entry is still skipped when another criterion is false. */
  partial?: string[];
}

export interface AssignmentRule {
  name: string;
  active: boolean;
  entries: RuleEntry[];
}

export interface ImportReport {
  rules: AssignmentRule[];
  refused: { rule: string; order: number; reason: string }[];
  partial: { rule: string; order: number; reason: string }[];
  warnings: string[];
}

/** A lead as Salesforce would store it. Keys are API field names without the "Lead." prefix. */
export type LeadRecord = Record<string, string | number | boolean | null | undefined>;
