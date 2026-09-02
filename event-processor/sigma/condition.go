package sigma

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// toStringList normalizes a YAML scalar or list into a []string.
func toStringList(value any) []string {
	switch v := value.(type) {
	case string:
		return []string{v}
	case int:
		return []string{strconv.Itoa(v)}
	case int64:
		return []string{strconv.FormatInt(v, 10)}
	case float64:
		// YAML numbers may parse as float; render ints cleanly.
		if v == float64(int64(v)) {
			return []string{strconv.FormatInt(int64(v), 10)}
		}
		return []string{strconv.FormatFloat(v, 'f', -1, 64)}
	case bool:
		return []string{strconv.FormatBool(v)}
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			out = append(out, toStringList(item)...)
		}
		return out
	default:
		return nil
	}
}

func isInt(s string) bool {
	_, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	return err == nil
}

func hasWildcard(s string) bool {
	// Sigma wildcards are * and ?; a backslash escapes them. Treat an escaped
	// wildcard as a literal.
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' {
			i++
			continue
		}
		if s[i] == '*' || s[i] == '?' {
			return true
		}
	}
	return false
}

// wildcardToRegex converts a Sigma wildcard value to a fully-anchored,
// case-insensitive regex (equality semantics: the whole field must match).
func wildcardToRegex(s string) string {
	return "(?i)^" + wildcardToRegexBody(s) + "$"
}

// wildcardToRegexBody converts a Sigma wildcard value to an UNanchored regex
// body (used for `raw` substring matching).
func wildcardToRegexBody(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '\\':
			if i+1 < len(s) && (s[i+1] == '*' || s[i+1] == '?') {
				b.WriteString(regexp.QuoteMeta(string(s[i+1])))
				i++
				continue
			}
			b.WriteString(regexp.QuoteMeta(string(c)))
		case '*':
			b.WriteString(".*")
		case '?':
			b.WriteString(".")
		default:
			b.WriteString(regexp.QuoteMeta(string(c)))
		}
	}
	return b.String()
}

// extractMitre merges the `tags:` (attack.*) list and the optional `mitre:`
// block into (tactics, techniqueIDs). Technique IDs are upper-cased; tactic
// tags (attack.<name>) are kept as their lower-case tactic names.
func extractMitre(s *SigmaRule) (tactics, attacks []string) {
	tSet := map[string]struct{}{}
	aSet := map[string]struct{}{}
	techRe := regexp.MustCompile(`^t\d{4}(\.\d{3})?$`)

	for _, tag := range s.Tags {
		t := strings.TrimSpace(strings.ToLower(tag))
		t = strings.TrimPrefix(t, "attack.")
		if t == "" {
			continue
		}
		if techRe.MatchString(t) {
			aSet[strings.ToUpper(t)] = struct{}{}
		} else {
			tSet[t] = struct{}{}
		}
	}
	if s.Mitre != nil {
		if s.Mitre.Tactic != "" {
			tSet[strings.ToLower(strings.TrimSpace(s.Mitre.Tactic))] = struct{}{}
		}
		if s.Mitre.Technique != "" {
			aSet[strings.ToUpper(strings.TrimSpace(s.Mitre.Technique))] = struct{}{}
		}
		if s.Mitre.SubTechnique != "" {
			aSet[strings.ToUpper(strings.TrimSpace(s.Mitre.SubTechnique))] = struct{}{}
		}
	}
	for t := range tSet {
		tactics = append(tactics, t)
	}
	for a := range aSet {
		attacks = append(attacks, a)
	}
	sort.Strings(tactics)
	sort.Strings(attacks)
	return tactics, attacks
}

// -----------------------------------------------------------------------------
// Condition mini-grammar → CEL
//
// Grammar (subset of the Sigma condition spec, covering the constructs used in
// the HiveArmor corpus):
//
//   expr    := term (('and'|'or') term)*
//   term    := 'not' term | '(' expr ')' | quantifier | selectionRef
//   quantifier := ('all'|'1') 'of' (glob | 'them')
//
// Anything the parser cannot represent (count()/timeframe/near correlations,
// '| count' aggregations) returns *ErrUnsupported.
// -----------------------------------------------------------------------------

func compileCondition(condition string, selections map[string]string, ruleID string) (string, error) {
	if strings.Contains(condition, "|") {
		// pipe = aggregation (count/near/...) — unsupported
		return "", &ErrUnsupported{Construct: "aggregation condition", RuleID: ruleID}
	}
	toks := tokenizeCondition(condition)
	p := &condParser{tokens: toks, selections: selections, ruleID: ruleID}
	expr, err := p.parseExpr()
	if err != nil {
		return "", err
	}
	if p.pos != len(p.tokens) {
		return "", &ErrUnsupported{Construct: "trailing tokens in condition: " + condition, RuleID: ruleID}
	}
	return expr, nil
}

var condTokenRe = regexp.MustCompile(`\(|\)|[A-Za-z0-9_*]+`)

func tokenizeCondition(s string) []string {
	return condTokenRe.FindAllString(s, -1)
}

type condParser struct {
	tokens     []string
	pos        int
	selections map[string]string
	ruleID     string
}

func (p *condParser) peek() string {
	if p.pos < len(p.tokens) {
		return p.tokens[p.pos]
	}
	return ""
}

func (p *condParser) next() string {
	t := p.peek()
	p.pos++
	return t
}

func (p *condParser) parseExpr() (string, error) {
	left, err := p.parseTerm()
	if err != nil {
		return "", err
	}
	for {
		op := strings.ToLower(p.peek())
		if op != "and" && op != "or" {
			break
		}
		p.next()
		right, err := p.parseTerm()
		if err != nil {
			return "", err
		}
		celOp := "&&"
		if op == "or" {
			celOp = "||"
		}
		left = "(" + left + " " + celOp + " " + right + ")"
	}
	return left, nil
}

func (p *condParser) parseTerm() (string, error) {
	tok := p.peek()
	low := strings.ToLower(tok)

	if low == "not" {
		p.next()
		inner, err := p.parseTerm()
		if err != nil {
			return "", err
		}
		return "!(" + inner + ")", nil
	}
	if tok == "(" {
		p.next()
		inner, err := p.parseExpr()
		if err != nil {
			return "", err
		}
		if p.peek() != ")" {
			return "", &ErrUnsupported{Construct: "unbalanced parentheses", RuleID: p.ruleID}
		}
		p.next()
		return "(" + inner + ")", nil
	}
	if low == "all" || low == "1" || low == "any" {
		// quantifier: (all|1|any) of (glob|them)
		if p.pos+1 < len(p.tokens) && strings.ToLower(p.tokens[p.pos+1]) == "of" {
			return p.parseQuantifier(low)
		}
	}

	// plain selection reference
	name := p.next()
	if name == "" {
		return "", &ErrUnsupported{Construct: "empty condition term", RuleID: p.ruleID}
	}
	expr, ok := p.selections[name]
	if !ok {
		return "", &ErrUnsupported{Construct: "unknown selection " + name, RuleID: p.ruleID}
	}
	return "(" + expr + ")", nil
}

func (p *condParser) parseQuantifier(quant string) (string, error) {
	p.next() // consume all|1|any
	p.next() // consume 'of'
	target := p.next()
	if target == "" {
		return "", &ErrUnsupported{Construct: "quantifier missing target", RuleID: p.ruleID}
	}

	var matched []string
	names := make([]string, 0, len(p.selections))
	for n := range p.selections {
		names = append(names, n)
	}
	sort.Strings(names)

	if strings.ToLower(target) == "them" {
		matched = names
	} else if strings.HasSuffix(target, "*") {
		prefix := strings.TrimSuffix(target, "*")
		for _, n := range names {
			if strings.HasPrefix(n, prefix) {
				matched = append(matched, n)
			}
		}
	} else {
		// exact name (uncommon, but valid)
		if _, ok := p.selections[target]; ok {
			matched = []string{target}
		}
	}
	if len(matched) == 0 {
		return "", &ErrUnsupported{Construct: "quantifier matched no selections: " + target, RuleID: p.ruleID}
	}

	join := " || " // "1 of" / "any of"
	if quant == "all" {
		join = " && "
	}
	parts := make([]string, 0, len(matched))
	for _, n := range matched {
		parts = append(parts, "("+p.selections[n]+")")
	}
	return "(" + strings.Join(parts, join) + ")", nil
}
