package http

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	rulesengine "github.com/hivearmor/event-processor/rules"
)

type evaluateRequest struct {
	RuleYAML string         `json:"ruleYaml"`
	Rule     string         `json:"rule"`
	Engine   string         `json:"engine"`
	Event    map[string]any `json:"event"`
}

func handleRuleEvaluate(c *gin.Context) {
	var req evaluateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":        err.Error(),
			"engineParity": rulesengine.EngineParityUnavailable,
			"matched":      false,
			"wouldAlert":   false,
			"honesty":      "Invalid evaluate payload. Sequence/risk/graph hits were not faked.",
		})
		return
	}
	ruleYAML := strings.TrimSpace(req.RuleYAML)
	if ruleYAML == "" {
		ruleYAML = strings.TrimSpace(req.Rule)
	}
	if ruleYAML == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":        "ruleYaml is required",
			"engineParity": rulesengine.EngineParityUnavailable,
			"matched":      false,
			"wouldAlert":   false,
			"honesty":      "No rule YAML supplied. Sequence/risk/graph hits were not faked as CEL matches.",
		})
		return
	}

	result := rulesengine.EvaluateDraft(ruleYAML, req.Event)
	if hint := strings.TrimSpace(req.Engine); hint != "" && result.Engine == rulesengine.EngineCEL {
		switch strings.ToLower(hint) {
		case rulesengine.EngineSequence, rulesengine.EngineRisk, rulesengine.EngineGraph:
			result.Engine = strings.ToLower(hint)
		}
	}
	c.JSON(http.StatusOK, result)
}
