package pipeline

// PipelineBlock is a top-level pipeline entry matching one or more dataTypes.
type PipelineBlock struct {
	DataTypes []string `yaml:"dataTypes"`
	Steps     []Step   `yaml:"steps"`
}

// Step is one processing step inside a pipeline block.
type Step struct {
	// Where is an optional CEL expression; if false the step is skipped.
	Where string `yaml:"where,omitempty"`

	// Operator fields — only one will be set per step.
	JSON    *JSONOp    `yaml:"json,omitempty"`
	Grok    *GrokOp    `yaml:"grok,omitempty"`
	Rename  *RenameOp  `yaml:"rename,omitempty"`
	Add     *AddOp     `yaml:"add,omitempty"`
	Cast    *CastOp    `yaml:"cast,omitempty"`
	Trim    *TrimOp    `yaml:"trim,omitempty"`
	Drop    *DropOp    `yaml:"drop,omitempty"`
	Delete  *DeleteOp  `yaml:"delete,omitempty"`
	KV      *KVOp      `yaml:"kv,omitempty"`
	Dynamic *DynamicOp `yaml:"dynamic,omitempty"`
}

type JSONOp struct {
	Source string `yaml:"source"`
	Where  string `yaml:"where,omitempty"`
}

type GrokPattern struct {
	FieldName string `yaml:"field_name"`
	Pattern   string `yaml:"pattern"`
}

type GrokOp struct {
	Patterns []GrokPattern `yaml:"patterns"`
	Source   string        `yaml:"source"`
	Where    string        `yaml:"where,omitempty"`
}

type RenameOp struct {
	From  []string `yaml:"from"`
	To    string   `yaml:"to"`
	Where string   `yaml:"where,omitempty"`
}

type AddParams struct {
	Key   string `yaml:"key"`
	Value any    `yaml:"value"`
}

type AddOp struct {
	Function string    `yaml:"function"`
	Params   AddParams `yaml:"params"`
	Where    string    `yaml:"where,omitempty"`
}

type CastOp struct {
	Fields []string `yaml:"fields"`
	To     string   `yaml:"to"`
	Where  string   `yaml:"where,omitempty"`
}

type TrimOp struct {
	Function  string   `yaml:"function"`
	Substring string   `yaml:"substring"`
	Fields    []string `yaml:"fields"`
	Where     string   `yaml:"where,omitempty"`
}

// DropOp discards the whole event when Where is truthy.
// Where can be set at the Step level or directly inside the drop block.
type DropOp struct {
	Where string `yaml:"where,omitempty"`
}

type DeleteOp struct {
	Fields []string `yaml:"fields"`
	Where  string   `yaml:"where,omitempty"`
}

type KVOp struct {
	FieldSplit string `yaml:"fieldSplit"`
	ValueSplit string `yaml:"valueSplit"`
}

type DynamicOp struct {
	Plugin string            `yaml:"plugin"`
	Params map[string]string `yaml:"params"`
	Where  string            `yaml:"where,omitempty"`
}
