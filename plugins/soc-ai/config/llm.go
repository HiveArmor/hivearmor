package config

const (
	// LLM content limits
	MAX_ALERT_CONTENT_SIZE = 100000 // Maximum characters for alert JSON sent to LLM (~25K tokens)

	// LLM retry configuration
	LLM_MAX_RETRIES = 3 // Maximum retry attempts for LLM calls
	LLM_RETRY_DELAY = 2 // Seconds between LLM retry attempts

	// Anthropic API version (required header)
	ANTHROPIC_API_VERSION = "2023-06-01"
)

// LLM_INSTRUCTION body moved to internal/prompt (hashed registry, id ha.socai.alert_analysis).
// Callers must use prompt.Require(prompt.IDAlertAnalysis).Body — do not re-embed here.

// GPT_FALSE_POSITIVE is the default reasoning for false positives without logs
var GPT_FALSE_POSITIVE = "This alert is categorized as a potential false positive due to two key factors. Firstly, it originates from an automated system, which may occasionally produce alerts without direct human validation. Additionally, the absence of any correlated logs further raises suspicion, as a genuine incident typically leaves a trail of relevant log entries. Hence, the combination of its system-generated nature and the lack of associated logs suggests a likelihood of being a false positive rather than a genuine security incident."

// CORRELATION_CONTEXT is the template for adding correlation context to prompts
var CORRELATION_CONTEXT = "\n\nThe current alert has historical correlation with previous alerts:\n%s"
