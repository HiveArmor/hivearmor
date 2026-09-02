package sigma

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// ErrUnsupported marks a Sigma construct the compiler cannot faithfully
// translate. The loader treats it like a bad CEL rule: skip the file and log a
// specific reason. It is NEVER turned into a partial/incorrect CEL string.
type ErrUnsupported struct {
	Construct string
	RuleID    string
}

func (e *ErrUnsupported) Error() string {
	if e.RuleID != "" {
		return fmt.Sprintf("sigma: unsupported construct %q in rule %s", e.Construct, e.RuleID)
	}
	return fmt.Sprintf("sigma: unsupported construct %q", e.Construct)
}

// CompiledRule is the compiler's output: the CEL `where` string plus the
// metadata the loader copies onto a rules.Rule.
type CompiledRule struct {
	Name          string
	Where         string
	DataTypes     []string
	Severity      int
	Description   string
	References    []string
	MitreTactics  []string
	MitreAttacks  []string
	DeduplicateBy []string
	GroupBy       []string
	Impact        [3]uint32 // confidentiality, integrity, availability
}

// unsupportedModifiers are Sigma value modifiers we deliberately do not
// translate (encoding/transform modifiers with no CEL equivalent). Hitting one
// fails the whole rule closed.
var unsupportedModifiers = map[string]bool{
	"base64":       true,
	"base64offset": true,
	"windash":      true,
	"utf16":        true,
	"utf16le":      true,
	"utf16be":      true,
	"wide":         true,
	"fieldref":     true,
	"expand":       true,
}

// Compile translates a SigmaRule into a CompiledRule. It returns an error
// (often *ErrUnsupported) if the rule cannot be faithfully represented; the
// caller must then skip the rule rather than load a partial translation.
func Compile(s *SigmaRule) (*CompiledRule, error) {
	if !s.IsSigma() {
		return nil, &ErrUnsupported{Construct: "not a sigma rule", RuleID: s.ID}
	}

	dataTypes := resolveDataTypes(s.LogSource)
	if len(dataTypes) == 0 {
		return nil, &ErrUnsupported{
			Construct: fmt.Sprintf("logsource product=%q category=%q service=%q",
				s.LogSource.Product, s.LogSource.Category, s.LogSource.Service),
			RuleID: s.ID,
		}
	}

	// Compile each named selection block (everything except `condition`) to CEL.
	selections := map[string]string{}
	var condition string
	for name, raw := range s.Detection {
		if name == "condition" {
			cond, ok := raw.(string)
			if !ok {
				return nil, &ErrUnsupported{Construct: "non-string condition", RuleID: s.ID}
			}
			condition = cond
			continue
		}
		cel, err := compileSelection(raw, s.ID)
		if err != nil {
			return nil, err
		}
		selections[name] = cel
	}
	if condition == "" {
		return nil, &ErrUnsupported{Construct: "missing condition", RuleID: s.ID}
	}
	if len(selections) == 0 {
		return nil, &ErrUnsupported{Construct: "no selections", RuleID: s.ID}
	}

	where, err := compileCondition(condition, selections, s.ID)
	if err != nil {
		return nil, err
	}

	out := &CompiledRule{
		Name:          deriveName(s),
		Where:         where,
		DataTypes:     dataTypes,
		Severity:      levelToSeverity(s.Level),
		Description:   s.Description,
		References:    s.References,
		DeduplicateBy: mapFields(s.DeduplicateBy),
		GroupBy:       mapFields(s.GroupBy),
	}
	out.MitreTactics, out.MitreAttacks = extractMitre(s)
	if s.Impact != nil {
		out.Impact = [3]uint32{
			impactWord(s.Impact.Confidentiality),
			impactWord(s.Impact.Integrity),
			impactWord(s.Impact.Availability),
		}
	}
	return out, nil
}

// deriveName produces a stable, collision-avoiding rule name. Sigma titles can
// collide with native CEL rule names, so Sigma-derived names are prefixed.
func deriveName(s *SigmaRule) string {
	base := strings.TrimSpace(s.Title)
	if base == "" {
		base = s.ID
	}
	short := s.ID
	if len(short) > 8 {
		short = short[:8]
	}
	if short != "" {
		return "SIGMA-" + short + " " + base
	}
	return "SIGMA " + base
}

// compileSelection turns one named selection block into a CEL boolean.
// A selection is a map of field(+modifiers) → value(s); its entries are ANDed.
// A rare list-of-maps selection ORs the sub-maps.
func compileSelection(raw any, ruleID string) (string, error) {
	switch v := raw.(type) {
	case map[string]any:
		return compileFieldMap(v, ruleID)
	case []any:
		// list of maps → OR
		var parts []string
		for _, item := range v {
			m, ok := item.(map[string]any)
			if !ok {
				return "", &ErrUnsupported{Construct: "selection list item is not a map", RuleID: ruleID}
			}
			expr, err := compileFieldMap(m, ruleID)
			if err != nil {
				return "", err
			}
			parts = append(parts, "("+expr+")")
		}
		if len(parts) == 0 {
			return "", &ErrUnsupported{Construct: "empty selection list", RuleID: ruleID}
		}
		return strings.Join(parts, " || "), nil
	default:
		return "", &ErrUnsupported{Construct: "unsupported selection shape", RuleID: ruleID}
	}
}

// compileFieldMap ANDs the entries of a field map. yaml.v3 unmarshals mapping
// keys in document order into a map (unordered), so we sort keys for stable,
// reviewable output.
func compileFieldMap(m map[string]any, ruleID string) (string, error) {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var parts []string
	for _, key := range keys {
		expr, err := compileFieldExpr(key, m[key], ruleID)
		if err != nil {
			return "", err
		}
		parts = append(parts, expr)
	}
	if len(parts) == 0 {
		return "", &ErrUnsupported{Construct: "empty selection", RuleID: ruleID}
	}
	if len(parts) == 1 {
		return parts[0], nil
	}
	for i := range parts {
		parts[i] = "(" + parts[i] + ")"
	}
	return strings.Join(parts, " && "), nil
}

// compileFieldExpr translates one `field|modifiers: value` entry to CEL.
func compileFieldExpr(fieldKey string, value any, ruleID string) (string, error) {
	segments := strings.Split(fieldKey, "|")
	field := segments[0]
	modifiers := segments[1:]

	for _, mod := range modifiers {
		if unsupportedModifiers[strings.ToLower(mod)] {
			return "", &ErrUnsupported{Construct: "modifier |" + mod, RuleID: ruleID}
		}
	}

	path, isRaw := resolveField(field)

	// null / exists
	if value == nil {
		return "!exists(\"" + path + "\")", nil
	}
	if len(modifiers) == 1 && strings.EqualFold(modifiers[0], "exists") {
		if b, ok := value.(bool); ok {
			if b {
				return "exists(\"" + path + "\")", nil
			}
			return "!exists(\"" + path + "\")", nil
		}
	}

	values := toStringList(value)
	if len(values) == 0 {
		return "", &ErrUnsupported{Construct: "empty value for " + fieldKey, RuleID: ruleID}
	}

	mod := ""
	all := false
	for _, m := range modifiers {
		lm := strings.ToLower(m)
		if lm == "all" {
			all = true
			continue
		}
		mod = lm
	}

	return emitMatch(path, isRaw, mod, all, values, ruleID)
}

// emitMatch produces the CEL for a resolved field path, modifier and value set.
func emitMatch(path string, isRaw bool, mod string, all bool, values []string, ruleID string) (string, error) {
	// Numeric comparisons must use the numeric helpers regardless of whether the
	// field mapped to a structured path or fell back to raw — a regex would be
	// wrong for a numeric threshold.
	switch mod {
	case "gte":
		return numeric(path, "greaterOrEqual", values[0], ruleID)
	case "gt":
		return numeric(path, "greaterThan", values[0], ruleID)
	case "lte":
		return numeric(path, "lessOrEqual", values[0], ruleID)
	case "lt":
		return numeric(path, "lessThan", values[0], ruleID)
	case "cidr":
		var parts []string
		for _, v := range values {
			parts = append(parts, fmt.Sprintf("inCIDR(%q, %q)", path, v))
		}
		if len(parts) == 1 {
			return parts[0], nil
		}
		return "(" + strings.Join(parts, " || ") + ")", nil
	}

	// If the field had no structured mapping, string matches degrade to a
	// case-insensitive regex over `raw`.
	if isRaw {
		return emitRawRegex(path, mod, all, values), nil
	}

	switch mod {
	case "": // plain equality (implicit OR over a list)
		return emitEquality(path, values), nil
	case "contains":
		return emitAffix(path, "contains", all, values), nil
	case "startswith":
		return emitAffix(path, "startsWith", all, values), nil
	case "endswith":
		return emitAffix(path, "endsWith", all, values), nil
	case "re":
		if len(values) == 1 {
			return fmt.Sprintf("regexMatch(%q, %q)", path, values[0]), nil
		}
		var parts []string
		for _, v := range values {
			parts = append(parts, fmt.Sprintf("regexMatch(%q, %q)", path, v))
		}
		return "(" + strings.Join(parts, " || ") + ")", nil
	default:
		return "", &ErrUnsupported{Construct: "modifier |" + mod, RuleID: ruleID}
	}
}

// emitEquality handles plain `field: value` (string→equalsIgnoreCase, int→equals),
// honoring embedded wildcards by routing to a regex, and OR-ing a value list.
func emitEquality(path string, values []string) string {
	var parts []string
	for _, v := range values {
		if hasWildcard(v) {
			parts = append(parts, fmt.Sprintf("regexMatch(%q, %q)", path, wildcardToRegex(v)))
			continue
		}
		if isInt(v) {
			parts = append(parts, fmt.Sprintf("equals(%q, %s)", path, v))
			continue
		}
		parts = append(parts, fmt.Sprintf("equalsIgnoreCase(%q, %q)", path, v))
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "(" + strings.Join(parts, " || ") + ")"
}

// emitAffix handles contains/startsWith/endsWith. Sigma is case-insensitive by
// default, so we emit a case-insensitive regex (anchored for prefix/suffix)
// rather than the case-sensitive contains/startsWith/endsWith helpers. `all`
// ANDs the values; otherwise they OR.
func emitAffix(path, kind string, all bool, values []string) string {
	join := " || "
	if all {
		join = " && "
	}
	var parts []string
	for _, v := range values {
		lit := regexp.QuoteMeta(v)
		var pat string
		switch kind {
		case "startsWith":
			pat = "(?i)^" + lit
		case "endsWith":
			pat = "(?i)" + lit + "$"
		default: // contains
			pat = "(?i)" + lit
		}
		parts = append(parts, fmt.Sprintf("regexMatch(%q, %q)", path, pat))
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "(" + strings.Join(parts, join) + ")"
}

// emitRawRegex matches an unmapped field's value(s) against `raw` with a
// case-insensitive regex — the documented fallback so an unmapped field never
// hard-fails the rule (it degrades to a raw-substring match).
func emitRawRegex(path, mod string, all bool, values []string) string {
	join := " || "
	if all {
		join = " && "
	}
	var parts []string
	for _, v := range values {
		var pat string
		if mod == "re" {
			pat = v
		} else if hasWildcard(v) {
			pat = "(?i)" + wildcardToRegexBody(v)
		} else {
			lit := regexp.QuoteMeta(v)
			switch mod {
			case "startswith":
				pat = "(?i)" + lit
			case "endswith":
				pat = "(?i)" + lit
			default:
				pat = "(?i)" + lit
			}
		}
		parts = append(parts, fmt.Sprintf("regexMatch(%q, %q)", path, pat))
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "(" + strings.Join(parts, join) + ")"
}

func numeric(path, fn, v, ruleID string) (string, error) {
	if !isInt(v) {
		return "", &ErrUnsupported{Construct: "non-integer numeric value " + v, RuleID: ruleID}
	}
	return fmt.Sprintf("%s(%q, %s)", fn, path, v), nil
}

// resolveField returns the event-processor path for a Sigma field and whether
// the caller must fall back to matching against `raw` (true when unmapped).
func resolveField(field string) (path string, isRaw bool) {
	if p, ok := epFieldMap[strings.ToLower(field)]; ok {
		if p == "raw" {
			return "raw", true
		}
		return p, false
	}
	return "raw", true
}

func mapFields(fields []string) []string {
	if len(fields) == 0 {
		return nil
	}
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		p, _ := resolveField(f)
		out = append(out, p)
	}
	return out
}
