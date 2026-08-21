---
name: opengrep-rule-writer
description: Generate Opengrep/Semgrep SAST rules — taint analysis for SQLi/XSS/SSRF/command injection, search mode for hardcoded secrets/weak crypto/missing auth, companion test files, false positive reduction patterns. Triggered by "semgrep rule", "opengrep SAST rule", "write SAST rule", "static analysis rule", "taint analysis rule".
---

# Opengrep / Semgrep SAST Rule Generator

Generates SAST rules for static analysis via two workflows: guided discovery and vulnerability-driven.

## Workflow Selection

**Guided Discovery** — Use when you have a specific behavior to detect.
Collect via Q&A:
1. What vulnerability to detect?
2. Target language/framework?
3. Vulnerable vs. safe code examples?
4. Taint (data flow) or search (structural pattern)?

**Vulnerability-Driven** — Use when given a CVE, CWE, or OWASP reference.
1. Research the vulnerability
2. Check existing rule coverage
3. Select mode and generate with commentary

## Mode Selection Logic

| Vulnerability | Mode |
|--------------|------|
| SQLi, XSS, SSRF, Command Injection | **Taint** — tracks user input → dangerous sink |
| Hardcoded secrets, weak crypto | **Search** — pattern matching |
| Missing auth checks | **Search** with `pattern-not-inside` |
| Terraform/config misconfiguration | **Search** on HCL structure |
| Business logic flows | **Taint** with custom sources |

## Rule Structure (Required Fields)

```yaml
rules:
  - id: <kebab-case-unique-id>
    message: |
      <What was found>. <Why it's dangerous>. <How to fix it>.
      CWE: CWE-89 (SQL Injection) — https://cwe.mitre.org/data/definitions/89.html
    languages: [java]  # or python, javascript, typescript, go, etc.
    severity: ERROR  # ERROR (Critical/High) | WARNING (Medium) | INFO (Low)
    metadata:
      category: security
      owasp: "A3:2021 Injection"
      cwe: CWE-89
      confidence: HIGH
      likelihood: HIGH
      impact: HIGH
      subcategory: vuln
    patterns: ...  # or pattern / pattern-either / taint
```

## Taint Rule Template (Injection Detection)

```yaml
rules:
  - id: user-input-to-sql-query-java
    message: |
      User-controlled input flows into a SQL query via string concatenation.
      This can lead to SQL injection. Use parameterized queries (PreparedStatement).
    languages: [java]
    severity: ERROR
    metadata:
      cwe: CWE-89
      owasp: "A3:2021 Injection"
      confidence: HIGH
    mode: taint
    pattern-sources:
      - patterns:
          - pattern: $REQ.getParameter(...)
          - pattern: $REQ.getHeader(...)
          - pattern: $REQ.getQueryString()
    pattern-sinks:
      - patterns:
          - pattern: $CONN.createStatement().execute(...)
          - pattern: $STMT.executeQuery($QUERY)
    pattern-sanitizers:
      - pattern: $CONN.prepareStatement(...)
```

## Search Rule Template (Weak Crypto)

```yaml
rules:
  - id: weak-cipher-mode-java
    message: |
      AES is used without specifying GCM mode. Java's default is ECB, which is 
      cryptographically broken. Use AES/GCM/NoPadding explicitly.
    languages: [java]
    severity: ERROR
    metadata:
      cwe: CWE-327
      confidence: HIGH
    pattern: Cipher.getInstance("AES")
```

## False Positive Reduction

```yaml
# pattern-not: exclude safe variants
patterns:
  - pattern: $OBJ.exec(...)
  - pattern-not: $OBJ.exec("static-command")

# pattern-not-inside: exclude safe contexts (inside validation wrappers)
patterns:
  - pattern: $QUERY.execute($INPUT)
  - pattern-not-inside: |
      if ($INPUT.matches("[a-zA-Z0-9]+")) {
        ...
      }

# metavariable-regex: restrict matched values  
metavariable-regex:
  metavariable: $ALGO
  regex: '(DES|RC4|MD5|SHA1)'
```

## Test File Standards

Every rule requires a companion test file with:
- Minimum **2 true positives** — vulnerable code that MUST trigger the rule
- Minimum **2 true negatives** — safe code that MUST NOT trigger the rule

```java
// ruleid: user-input-to-sql-query-java  <- true positive marker
String q = "SELECT * FROM users WHERE id = " + request.getParameter("id");
stmt.execute(q);

// ok: user-input-to-sql-query-java  <- true negative marker
PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
ps.setString(1, request.getParameter("id"));
```

## Storage Convention

Rules stored under: `custom-rules/<vuln-type>/`
Test files alongside: `custom-rules/<vuln-type>/<rule-id>.java`

## Core Principle

"Don't just pattern-match on function names. Understand what makes it dangerous — the root cause, not the symptom."
