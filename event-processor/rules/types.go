package rules

// Rule defines a correlation rule loaded from YAML.
type Rule struct {
	ID            int64      `yaml:"id"`
	DataTypes     []string   `yaml:"dataTypes"`
	Name          string     `yaml:"name"`
	Type          string     `yaml:"type,omitempty"`
	Impact        *Impact    `yaml:"impact"`
	Severity      int        `yaml:"severity,omitempty"`
	MITRE         *MITRERef  `yaml:"mitre,omitempty"`
	Category      string     `yaml:"category"`
	Technique     string     `yaml:"technique"`
	Adversary     string     `yaml:"adversary"`
	References    []string   `yaml:"references"`
	Description   string     `yaml:"description"`
	Where         string     `yaml:"where"`
	AfterEvents   []SearchRequest `yaml:"afterEvents,omitempty"`
	Correlation   []SearchRequest `yaml:"correlation,omitempty"`
	DeduplicateBy []string   `yaml:"deduplicateBy,omitempty"`
	GroupBy       []string   `yaml:"groupBy,omitempty"`
	// Enterprise extensions
	RiskScore     int        `yaml:"riskScore,omitempty"`
	Sequence      []SeqStep  `yaml:"sequence,omitempty"`
	AnomalyDetect bool       `yaml:"anomalyDetect,omitempty"`
	// graph_offense extension
	CypherQuery          string   `yaml:"cypherQuery,omitempty"`
	AlertFields          []string `yaml:"alertFields,omitempty"`
	CheckIntervalSeconds int      `yaml:"checkIntervalSeconds,omitempty"`
}

// MITRERef holds ATT&CK tactic and technique IDs for a rule.
type MITRERef struct {
	Tactics []string `yaml:"tactics,omitempty"`
	Attacks []string `yaml:"attacks,omitempty"`
}

type Impact struct {
	Confidentiality uint32 `yaml:"confidentiality"`
	Integrity       uint32 `yaml:"integrity"`
	Availability    uint32 `yaml:"availability"`
}

type SearchRequest struct {
	IndexPattern string       `yaml:"indexPattern"`
	With         []Expression `yaml:"with"`
	Within       string       `yaml:"within"`
	Count        int64        `yaml:"count"`
	Or           []SearchRequest `yaml:"or,omitempty"`
}

type Expression struct {
	Field    string `yaml:"field"`
	Operator string `yaml:"operator"`
	Value    string `yaml:"value"`
}

// SeqStep is one step in a sequence rule.
type SeqStep struct {
	Where  string `yaml:"where"`
	Within string `yaml:"within"`
}

// HasRiskScore reports whether this rule uses risk-based scoring instead of direct alert.
func (r *Rule) HasRiskScore() bool {
	return r.RiskScore > 0
}

// HasSequence reports whether this rule uses sequence detection.
func (r *Rule) HasSequence() bool {
	return len(r.Sequence) > 0
}

// IsGraphOffense reports whether this is a graph_offense type rule.
func (r *Rule) IsGraphOffense() bool {
	return r.Type == "graph_offense"
}

// Normalize copies AfterEvents into Correlation if Correlation is empty (legacy alias).
func (r *Rule) Normalize() {
	if len(r.Correlation) == 0 && len(r.AfterEvents) > 0 {
		r.Correlation = r.AfterEvents
	}
	if r.Impact == nil {
		r.Impact = &Impact{}
	}
}
