package llm

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hivearmor/plugins/soc-ai/config"
	"github.com/hivearmor/plugins/soc-ai/schema"
	"github.com/hivearmor/plugins/soc-ai/utils"
)

const nlQuerySystemPrompt = `You are an expert OpenSearch query builder for HiveArmor SIEM.

## Your Task
Convert a natural language question into a valid OpenSearch DSL query (bool query).

## HiveArmor Index Schema

### Common fields across all indices
- @timestamp: ISO-8601 datetime of the event
- dataType: source type (e.g. WINDOWS_AGENT, LINUX_AGENT, FIREWALL, IDS, PROXY, ANTIVIRUS, SYSLOG, CLOUDTRAIL)
- severity: 1=low, 2=medium, 3=high, 4=critical

### Log-specific fields (index: _v3_hive_log-*)
- logx.action: event action (LOGIN, LOGOUT, FAILED_LOGIN, FILE_ACCESS, PROCESS_CREATE, NETWORK_CONNECT, PRIVILEGE_ESCALATION, POLICY_VIOLATION)
- logx.srcIp: source IP address
- logx.dstIp: destination IP address
- logx.srcPort: source port (integer)
- logx.dstPort: destination port (integer)
- logx.srcCountry: ISO 3166-1 alpha-2 country code of source IP (e.g. "RU", "CN", "US")
- logx.username: user who performed the action
- logx.hostname: host where the event occurred
- logx.protocol: network protocol (TCP, UDP, ICMP)
- logx.filePath: path of accessed/modified file
- logx.processName: name of the process
- logx.commandLine: command line arguments
- logx.parentProcess: parent process name
- logx.eventId: Windows Event ID (integer)
- logx.outcome: event outcome ("success", "failure")

### Alert-specific fields (index: _v3_hive_alert-*)
- name: alert rule name
- category: alert category
- status: 1=open, 2=in progress, 3=resolved, 4=false positive, 5=completed

### Windows Event ID references
- 4624: Successful logon
- 4625: Failed logon
- 4648: Logon with explicit credentials
- 4672/4673/4674: Privilege use / special logon
- 4688: Process creation
- 4698/4702: Scheduled task created/modified
- 4720/4726: User account created/deleted
- 4732/4756: Member added to security/domain group
- 7045: New service installed

## Time Expressions
Use OpenSearch relative time expressions:
- "last hour" → {"range": {"@timestamp": {"gte": "now-1h"}}}
- "last 24 hours" / "today" → {"range": {"@timestamp": {"gte": "now-24h"}}}
- "yesterday" → {"range": {"@timestamp": {"gte": "now-48h", "lte": "now-24h"}}}
- "last week" → {"range": {"@timestamp": {"gte": "now-7d"}}}
- "last month" → {"range": {"@timestamp": {"gte": "now-30d"}}}

## Geographic filtering
Use logx.srcCountry with ISO 3166-1 alpha-2 codes:
- Russia → "RU", China → "CN", USA → "US", North Korea → "KP", Iran → "IR"
- "external IPs" → use a must_not filter: {"term": {"logx.srcIp.keyword": "10.*"}} is NOT valid.
  Instead use a bool must_not with {"prefix": {"logx.srcIp.keyword": "10."}} plus 172.16. and 192.168. ranges.

## Response Format
Respond ONLY with valid JSON matching this exact schema — no prose, no markdown, just JSON:
{
  "query": { /* valid OpenSearch DSL bool query */ },
  "explanation": "One sentence describing what the query finds",
  "suggestedFilters": [
    {"field": "fieldName", "value": "fieldValue", "label": "Human-readable label"},
    ...
  ]
}

Rules:
- query must be a valid OpenSearch bool query object
- explanation must accurately describe what the query filters for
- suggestedFilters: 2-4 optional chips to refine results; omit if none are useful
- If the question mentions a field you don't know, use a wildcard match on the "message" field
- Your entire response must be valid JSON. Do not include any text outside the JSON object.`

// NLQueryRequest is the request body for natural language → DSL translation
type NLQueryRequest struct {
	Question     string            `json:"question"`
	IndexPattern string            `json:"indexPattern,omitempty"`
	Schema       *NLQuerySchema    `json:"schema,omitempty"`
}

// NLQuerySchema provides optional field hints to improve query accuracy
type NLQuerySchema struct {
	Fields []string `json:"fields,omitempty"`
}

// NLQuerySuggestedFilter is a quick-add filter chip from the LLM response
type NLQuerySuggestedFilter struct {
	Field string `json:"field"`
	Value string `json:"value"`
	Label string `json:"label"`
}

// NLQueryResult is the structured LLM response for NL→DSL translation
type NLQueryResult struct {
	Query            json.RawMessage          `json:"query"`
	Explanation      string                   `json:"explanation"`
	SuggestedFilters []NLQuerySuggestedFilter `json:"suggestedFilters,omitempty"`
}

// SendNLQueryRequest sends a natural language question to the LLM and returns an OpenSearch DSL query.
func SendNLQueryRequest(req *NLQueryRequest) (*NLQueryResult, error) {
	if req == nil || req.Question == "" {
		return nil, fmt.Errorf("SendNLQueryRequest: question is required")
	}

	cfg := config.GetConfig()
	if cfg == nil {
		return nil, fmt.Errorf("SendNLQueryRequest: plugin not configured")
	}

	// Build user message: question + optional index/schema hints
	userMsg := req.Question
	if req.IndexPattern != "" {
		userMsg = fmt.Sprintf("Index pattern: %s\n\nQuestion: %s", req.IndexPattern, req.Question)
	}
	if req.Schema != nil && len(req.Schema.Fields) > 0 {
		fieldsJSON, _ := json.Marshal(req.Schema.Fields)
		userMsg = fmt.Sprintf("%s\n\nAvailable fields: %s", userMsg, string(fieldsJSON))
	}

	isAnthropic := isAnthropicProvider(cfg.URL)
	var requestJSON []byte
	var err error

	if isAnthropic {
		maxTokens := cfg.MaxTokens
		if maxTokens == 0 {
			maxTokens = 2048
		}
		apiReq := schema.AnthropicRequest{
			Model:     cfg.Model,
			System:    nlQuerySystemPrompt,
			MaxTokens: maxTokens,
			Messages: []schema.AnthropicMessage{
				{Role: "user", Content: userMsg},
			},
		}
		requestJSON, err = json.Marshal(apiReq)
	} else {
		apiReq := schema.GPTRequest{
			Model: cfg.Model,
			Messages: []schema.GPTMessage{
				{Role: "system", Content: nlQuerySystemPrompt},
				{Role: "user", Content: userMsg},
			},
			ResponseFormat: &schema.GPTResponseFormat{Type: "json_object"},
		}
		if cfg.MaxTokens > 0 {
			apiReq.MaxTokens = cfg.MaxTokens
		}
		requestJSON, err = json.Marshal(apiReq)
	}
	if err != nil {
		return nil, fmt.Errorf("error marshalling NL query request: %v", err)
	}

	headers := buildHeaders(cfg)

	backoff := time.Duration(config.LLM_RETRY_DELAY) * time.Second
	var lastErr error

	for attempt := 1; attempt <= config.LLM_MAX_RETRIES; attempt++ {
		var responseText string

		if isAnthropic {
			response, status, reqErr := utils.DoParseReq[schema.AnthropicResponse](cfg.URL, requestJSON, "POST", headers, config.HTTP_GPT_TIMEOUT)
			if reqErr != nil {
				lastErr = fmt.Errorf("attempt %d: status=%d err=%v", attempt, status, reqErr)
			} else if len(response.Content) > 0 {
				responseText = response.Content[0].Text
			}
		} else {
			response, status, reqErr := utils.DoParseReq[schema.GPTResponse](cfg.URL, requestJSON, "POST", headers, config.HTTP_GPT_TIMEOUT)
			if reqErr != nil {
				lastErr = fmt.Errorf("attempt %d: status=%d err=%v", attempt, status, reqErr)
			} else if len(response.Choices) > 0 {
				responseText = response.Choices[0].Message.Content
			}
		}

		if responseText != "" {
			jsonStr, extractErr := extractJSON(responseText)
			if extractErr != nil {
				lastErr = fmt.Errorf("extract JSON: %v", extractErr)
				continue
			}

			var result NLQueryResult
			if parseErr := json.Unmarshal([]byte(jsonStr), &result); parseErr != nil {
				lastErr = fmt.Errorf("parse NL query result: %v", parseErr)
				continue
			}
			if len(result.Query) == 0 {
				lastErr = fmt.Errorf("LLM returned empty query")
				continue
			}
			return &result, nil
		}

		if attempt < config.LLM_MAX_RETRIES {
			time.Sleep(backoff)
			backoff = min(backoff*2, 30*time.Second)
		}
	}

	return nil, fmt.Errorf("all LLM attempts failed for nl-query: %v", lastErr)
}
