package sequence

import (
	"time"

	ha_rules "github.com/hivearmor/event-processor/rules"
)

// FromRules converts loaded correlation rules with sequence steps into SequenceRule values.
// Lives here (not in package rules) so sequence can call ExceptionMatches without a circular import.
func FromRules(all []*ha_rules.Rule) []SequenceRule {
	var result []SequenceRule
	for _, r := range all {
		if r == nil || !r.HasSequence() {
			continue
		}
		sr := SequenceRule{
			ID:   ha_rules.RuleIDKey(r.ID),
			Name: r.Name,
		}
		for _, step := range r.Sequence {
			d, _ := time.ParseDuration(step.Within)
			if d == 0 {
				d = 5 * time.Minute
			}
			sr.Steps = append(sr.Steps, StepDef{
				Where:  step.Where,
				Within: d,
			})
		}
		result = append(result, sr)
	}
	return result
}
