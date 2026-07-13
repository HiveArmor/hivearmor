package operators

import (
	"regexp"
	"strings"
)

// tokenPatterns maps {{.name}} tokens to their regex equivalent.
var tokenPatterns = map[string]string{
	"{{.integer}}":   `[-+]?\d+`,
	"{{.float}}":     `[-+]?\d+(?:\.\d+)?`,
	"{{.word}}":      `\S+`,
	"{{.data}}":      `.+?`,
	"{{.greedy}}":    `.+`,
	"{{.ipv4}}":      `\d{1,3}(?:\.\d{1,3}){3}`,
	"{{.ipv6}}":      `[0-9a-fA-F:]+(?:%\w+)?`,
	"{{.hostname}}":  `[a-zA-Z0-9._-]+`,
	"{{.time}}":      `\d{2}:\d{2}:\d{2}(?:\.\d+)?`,
	"{{.monthName}}": `(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)`,
	"{{.monthDay}}":  `[ \t]*\d{1,2}`,
	"{{.day}}":       `\d{1,2}`,
	"{{.year}}":      `\d{4}`,
	"{{.space}}":     `[ \t]+`,
}

type grokPattern struct {
	fieldName string
	regex     *regexp.Regexp
}

var grokCache = map[string]*grokPattern{}

func compileGrokPattern(fieldName, pattern string) *grokPattern {
	key := fieldName + ":" + pattern
	if p, ok := grokCache[key]; ok {
		return p
	}
	re := patternToRegex(pattern)
	compiled, err := regexp.Compile(re)
	if err != nil {
		compiled = regexp.MustCompile(`.*`)
	}
	gp := &grokPattern{fieldName: fieldName, regex: compiled}
	grokCache[key] = gp
	return gp
}

func patternToRegex(pattern string) string {
	// Replace tokens with capturing groups first, then the remainder is treated as a literal.
	// Split on token boundaries to preserve literal text quoting.
	result := pattern
	for token, re := range tokenPatterns {
		result = strings.ReplaceAll(result, token, "\x00CAPTURE\x00"+re+"\x00END\x00")
	}
	// Now quote the literal parts and restore capturing groups.
	var sb strings.Builder
	for _, chunk := range strings.Split(result, "\x00CAPTURE\x00") {
		parts := strings.SplitN(chunk, "\x00END\x00", 2)
		if len(parts) == 2 {
			sb.WriteString("(")
			sb.WriteString(parts[0])
			sb.WriteString(")")
			sb.WriteString(regexp.QuoteMeta(parts[1]))
		} else {
			sb.WriteString(regexp.QuoteMeta(parts[0]))
		}
	}
	return sb.String()
}

type GrokPatternDef struct {
	FieldName string
	Pattern   string
}

// GrokOp extracts fields from data[source] using ordered patterns.
func GrokOp(patterns []GrokPatternDef, source string, data map[string]any) {
	text := getString(data, source)
	if text == "" {
		return
	}

	logMap := getOrCreateMap(data, "log")
	remaining := text
	for _, pd := range patterns {
		p := compileGrokPattern(pd.FieldName, pd.Pattern)
		m := p.regex.FindStringSubmatchIndex(remaining)
		if m == nil || len(m) < 4 {
			continue
		}
		start, end := m[2], m[3]
		if start < 0 || end < 0 {
			continue
		}
		logMap[pd.FieldName] = remaining[start:end]
		remaining = remaining[m[1]:]
	}
}
