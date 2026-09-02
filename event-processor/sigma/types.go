package sigma

// SigmaRule is the subset of the Sigma rule schema the event-processor compiler
// understands. Files under builtin-rules/ authored in Sigma format
// (title + detection + logsource) unmarshal into this shape; the compiler
// translates the detection block into a CEL `where` expression at load time.
//
// Fields the compiler does not use (falsepositives, author, date, ...) are
// intentionally omitted — yaml.Unmarshal ignores unknown keys.
type SigmaRule struct {
	ID            string            `yaml:"id"`
	Title         string            `yaml:"title"`
	Status        string            `yaml:"status"`
	Description   string            `yaml:"description"`
	References    []string          `yaml:"references"`
	Level         string            `yaml:"level"`
	Tags          []string          `yaml:"tags"`
	LogSource     LogSource         `yaml:"logsource"`
	Detection     map[string]any    `yaml:"detection"`
	Mitre         *SigmaMitre       `yaml:"mitre"`
	Impact        *SigmaImpact      `yaml:"impact"`
	DeduplicateBy []string          `yaml:"deduplicateBy"`
	GroupBy       []string          `yaml:"groupBy"`
}

// LogSource identifies the telemetry a Sigma rule applies to. It is mapped to
// the event-processor `dataTypes` list via the logsource→dataType table.
type LogSource struct {
	Product  string `yaml:"product"`
	Category string `yaml:"category"`
	Service  string `yaml:"service"`
}

// SigmaMitre is the single-technique `mitre:` block some HiveArmor Sigma files
// carry in addition to `tags:`. Both are merged into the rule's MITRE refs.
type SigmaMitre struct {
	Tactic       string `yaml:"tactic"`
	Technique    string `yaml:"technique"`
	SubTechnique string `yaml:"subtechnique"`
}

// SigmaImpact carries the confidentiality/integrity/availability words
// (low/medium/high/critical) some HiveArmor Sigma files include.
type SigmaImpact struct {
	Confidentiality string `yaml:"confidentiality"`
	Integrity       string `yaml:"integrity"`
	Availability    string `yaml:"availability"`
}

// IsSigma reports whether the parsed document looks like a Sigma rule (as
// opposed to a native HiveArmor CEL rule). Used by the loader to route a file
// with no `name`/`where` into the Sigma compile path.
func (s *SigmaRule) IsSigma() bool {
	return s != nil && s.Title != "" && len(s.Detection) > 0
}
