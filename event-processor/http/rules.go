package http

import (
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	rulesengine "github.com/hivearmor/event-processor/rules"
)

func registerRulesRoutes(r *gin.Engine) {
	r.GET("/api/ha-rules", handleListRules)
	internalKey := os.Getenv("INTERNAL_KEY")
	r.GET("/api/rules/status", internalKeyAuth(internalKey), handleRulesStatus)
}

// handleListRules returns all loaded rules.
// Optional query param: hasSequence=true — filters to sequence rules only.
func handleListRules(c *gin.Context) {
	hasSeqParam := c.Query("hasSequence")

	all := rulesengine.AllRules()

	type ruleResp struct {
		ID          int64    `json:"id"`
		Name        string   `json:"name"`
		DataTypes   []string `json:"dataTypes"`
		Category    string   `json:"category"`
		Technique   string   `json:"technique"`
		HasRiskScore bool    `json:"hasRiskScore"`
		HasSequence  bool    `json:"hasSequence"`
		SequenceSteps int    `json:"sequenceSteps,omitempty"`
	}

	var out []ruleResp
	for _, r := range all {
		isSeq := r.HasSequence()
		if hasSeqParam != "" {
			want, err := strconv.ParseBool(hasSeqParam)
			if err == nil && isSeq != want {
				continue
			}
		}
		out = append(out, ruleResp{
			ID:            r.ID,
			Name:          r.Name,
			DataTypes:     r.DataTypes,
			Category:      r.Category,
			Technique:     r.Technique,
			HasRiskScore:  r.HasRiskScore(),
			HasSequence:   isSeq,
			SequenceSteps: len(r.Sequence),
		})
	}

	c.JSON(http.StatusOK, out)
}

// handleRulesStatus returns a summary of the currently loaded rule set.
// Requires X-Internal-Key — used by the GitOps E2E test to verify hot-reload.
func handleRulesStatus(c *gin.Context) {
	all := rulesengine.AllRules()

	type ruleSummary struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	}

	summaries := make([]ruleSummary, 0, len(all))
	for _, r := range all {
		summaries = append(summaries, ruleSummary{ID: r.ID, Name: r.Name})
	}

	c.JSON(http.StatusOK, gin.H{
		"activeRules": summaries,
		"count":       len(summaries),
		"lastReload":  time.Now().UTC().Format(time.RFC3339),
	})
}
