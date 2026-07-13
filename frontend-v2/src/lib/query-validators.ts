// Per-mode query syntax validators
// Returns errors[] (for the error strip) and context (for autocomplete hint)

export interface ValidationError {
  message: string;
  pos?: number;   // character offset where the error is (best-effort)
}

export interface ValidationResult {
  errors: ValidationError[];
  valid: boolean;
}

// ── KQL ──────────────────────────────────────────────────────────────────────
// Supports: field:value, field:(v1 OR v2), wildcards * ?, NOT field:v, AND/OR/NOT

export function validateKQL(query: string): ValidationResult {
  const errors: ValidationError[] = [];
  const q = query.trim();
  if (!q) return { errors, valid: true };

  // Unbalanced parentheses
  let depth = 0;
  for (let i = 0; i < q.length; i++) {
    if (q[i] === "(") depth++;
    else if (q[i] === ")") {
      depth--;
      if (depth < 0) {
        errors.push({ message: "Unmatched closing parenthesis", pos: i });
        depth = 0;
      }
    }
  }
  if (depth > 0) errors.push({ message: "Unclosed parenthesis" });

  // Unbalanced quotes
  let inDouble = false, inSingle = false;
  for (let i = 0; i < q.length; i++) {
    if (q[i] === '"' && !inSingle) inDouble = !inDouble;
    else if (q[i] === "'" && !inDouble) inSingle = !inSingle;
  }
  if (inDouble) errors.push({ message: 'Unclosed double quote' });
  if (inSingle) errors.push({ message: "Unclosed single quote" });

  // Bare operator at start/end
  if (/^(AND|OR)\s/i.test(q)) errors.push({ message: "Query cannot begin with AND/OR" });
  if (/\s(AND|OR)$/i.test(q)) errors.push({ message: "Query cannot end with AND/OR" });

  // Double operator
  if (/\b(AND|OR)\s+(AND|OR)\b/i.test(q)) {
    errors.push({ message: "Double operator (AND OR / OR AND)" });
  }

  // Empty group
  if (/\(\s*\)/.test(q)) errors.push({ message: "Empty parenthesis group ()" });

  // field: with no value — warn only (could be intentional wildcard)
  const bareColon = q.match(/(\w[\w.]*)\s*:\s*(?=\s|$)/);
  if (bareColon) {
    errors.push({ message: `Field "${bareColon[1]}" has no value after colon` });
  }

  return { errors, valid: errors.length === 0 };
}

// ── Lucene ───────────────────────────────────────────────────────────────────
// Supports: field:value, field:[x TO y], fuzzy~N, boost^N, +/-prefix

export function validateLucene(query: string): ValidationResult {
  const errors: ValidationError[] = [];
  const q = query.trim();
  if (!q) return { errors, valid: true };

  // Parentheses balance
  let depth = 0;
  for (let i = 0; i < q.length; i++) {
    if (q[i] === "(") depth++;
    else if (q[i] === ")") {
      depth--;
      if (depth < 0) { errors.push({ message: "Unmatched closing parenthesis", pos: i }); depth = 0; }
    }
  }
  if (depth > 0) errors.push({ message: "Unclosed parenthesis" });

  // Bracket balance for ranges [x TO y] and {x TO y}
  let sqDepth = 0, curDepth = 0;
  for (const ch of q) {
    if (ch === "[") sqDepth++;
    else if (ch === "]") { sqDepth--; if (sqDepth < 0) { errors.push({ message: "Unmatched ]" }); sqDepth = 0; } }
    else if (ch === "{") curDepth++;
    else if (ch === "}") { curDepth--; if (curDepth < 0) { errors.push({ message: "Unmatched }" }); curDepth = 0; } }
  }
  if (sqDepth > 0) errors.push({ message: "Unclosed range bracket [" });
  if (curDepth > 0) errors.push({ message: "Unclosed range brace {" });

  // Range without TO keyword
  const rangeNoTo = q.match(/[\[{][^\]}\n]+[\]}\n]/g);
  if (rangeNoTo) {
    for (const r of rangeNoTo) {
      if (!/\bTO\b/.test(r)) {
        errors.push({ message: `Range "${r.slice(0, 20)}" missing TO keyword (e.g. [1 TO 10])` });
      }
    }
  }

  // Unbalanced quotes
  let inQ = false;
  for (const ch of q) {
    if (ch === '"') inQ = !inQ;
  }
  if (inQ) errors.push({ message: "Unclosed double quote" });

  // Fuzzy with non-numeric value e.g. field:value~abc
  const badFuzzy = q.match(/~([a-zA-Z]\w*)/);
  if (badFuzzy) errors.push({ message: `Fuzzy operator ~ must be followed by a number (e.g. ~2), not "${badFuzzy[1]}"` });

  // Bare operator at start
  if (/^(AND|OR|NOT)\s/i.test(q)) errors.push({ message: "Query cannot begin with AND/OR" });

  return { errors, valid: errors.length === 0 };
}

// ── SQL ───────────────────────────────────────────────────────────────────────
// Validates basic SELECT...FROM...WHERE structure

export function validateSQL(query: string): ValidationResult {
  const errors: ValidationError[] = [];
  const q = query.trim();
  if (!q) return { errors, valid: true };

  // SELECT check (warn if missing — allows partial typing)
  const hasSelect = /\bSELECT\b/i.test(q);
  const hasFrom   = /\bFROM\b/i.test(q);

  if (hasSelect && !hasFrom) {
    errors.push({ message: "SELECT requires a FROM clause" });
  }
  if (!hasSelect && hasFrom) {
    // FROM without SELECT is ok for incremental typing — soft warning only
    // skip to avoid annoying users mid-type
  }

  // Paren balance
  let depth = 0;
  for (const ch of q) {
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth < 0) { errors.push({ message: "Unmatched )" }); depth = 0; } }
  }
  if (depth > 0) errors.push({ message: "Unclosed parenthesis" });

  // Quote balance
  let inSingle = false;
  for (let i = 0; i < q.length; i++) {
    if (q[i] === "'" && q[i-1] !== "\\") inSingle = !inSingle;
  }
  if (inSingle) errors.push({ message: "Unclosed single quote" });

  // LIMIT must be numeric
  const limitMatch = q.match(/\bLIMIT\s+([^\s;]+)/i);
  if (limitMatch && !/^\d+$/.test(limitMatch[1])) {
    errors.push({ message: `LIMIT value must be a number, got "${limitMatch[1]}"` });
  }

  // SELECT * or SELECT fields — ok
  // Check for consecutive keywords that make no sense together
  if (/\bWHERE\s+WHERE\b/i.test(q)) errors.push({ message: "Duplicate WHERE clause" });
  if (/\bFROM\s+WHERE\b/i.test(q)) errors.push({ message: "FROM must be followed by a table/index name" });

  return { errors, valid: errors.length === 0 };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export type QueryMode = "kql" | "lucene" | "sql";

export function validateQuery(query: string, mode: QueryMode): ValidationResult {
  switch (mode) {
    case "kql":    return validateKQL(query);
    case "lucene": return validateLucene(query);
    case "sql":    return validateSQL(query);
  }
}
