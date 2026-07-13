package processor

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/hivearmor/plugins/soc-ai/config"
	"github.com/hivearmor/plugins/soc-ai/elastic"
	"github.com/hivearmor/plugins/soc-ai/schema"
	"github.com/hivearmor/plugins/soc-ai/utils"
)

// SaveToElastic processes and saves the alert analysis to Elasticsearch, then
// posts the result back to the Spring Boot backend so Postgres is updated.
func SaveToElastic(alert *schema.AlertFields) error {
	resp := elastic.ConvertFromAlertDBToGPTResponse(alert)
	resp.Status = "Completed"

	cfg := config.GetConfig()

	// Attempt to save to OpenSearch (non-fatal if unavailable in standalone mode)
	err := elastic.ElasticQuery(config.SOC_AI_INDEX, resp, "update")
	if err != nil {
		if strings.Contains(err.Error(), "index_not_found_exception") || strings.Contains(err.Error(), "no such index") {
			if createErr := elastic.CreateIndexIfNotExist(config.SOC_AI_INDEX); createErr != nil {
				catcher.Error("Failed to create OpenSearch index; skipping OpenSearch save", createErr, map[string]any{
					"process": "plugin_com.hivearmor.soc-ai",
				})
			} else if retryErr := elastic.ElasticQuery(config.SOC_AI_INDEX, resp, "update"); retryErr != nil {
				catcher.Error("Failed to save to OpenSearch after index creation", retryErr, map[string]any{
					"process": "plugin_com.hivearmor.soc-ai",
					"alertId": alert.Id,
				})
			}
		} else {
			// Non-fatal: log the error but continue to post back to Spring Boot
			catcher.Error("Failed to save to OpenSearch", err, map[string]any{
				"process": "plugin_com.hivearmor.soc-ai",
				"alertId": alert.Id,
			})
		}
	}

	// POST result back to Spring Boot so Postgres triage table gets updated.
	// This is the authoritative path for the frontend to retrieve results.
	if cfg.Backend != "" {
		if postErr := postResultToBackend(cfg, alert, resp); postErr != nil {
			catcher.Error("Failed to post result to backend", postErr, map[string]any{
				"process": "plugin_com.hivearmor.soc-ai",
				"alertId": alert.Id,
			})
		}
	}

	if cfg.ChangeAlertStatus {
		err = elastic.ChangeAlertStatus(alert.Id, config.API_ALERT_COMPLETED_STATUS_CODE, alert.DataSource, alert.GPTClassification+" - "+alert.GPTReasoning)
		if err != nil {
			_ = catcher.Error("error while changing alert status in elastic: %v", err, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
		}
	}

	if cfg.AutomaticIncidentCreation && alert.GPTClassification == schema.ClassificationPossibleIncident {
		incidentsDetails, err := elastic.GetIncidentsByPattern("Incident in " + alert.DataSource)
		if err != nil {
			_ = catcher.Error("error while getting incidents by pattern: %v", err, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
		}

		incidentExists := false
		if len(incidentsDetails) != 0 {
			for _, incident := range incidentsDetails {
				if strings.HasSuffix(incident.IncidentName, "Incident in "+alert.DataSource) {
					incidentExists = true
					err = elastic.AddAlertToIncident(incident.ID, alert)
					if err != nil {
						_ = catcher.Error("error while adding alert to incident: %v", err, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
					}
				}
			}
		}

		if !incidentExists {
			err = elastic.CreateNewIncident(alert)
			if err != nil {
				_ = catcher.Error("error while creating incident: %v", err, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
			}
		}
	}
	return nil
}

// postResultToBackend sends the LLM analysis result to the Spring Boot backend.
// The backend stores it in Postgres and marks the triage record as COMPLETED.
func postResultToBackend(cfg *config.Config, alert *schema.AlertFields, resp schema.GPTAlertResponse) error {
	// Build the payload the backend's UtmAiTriageService.saveResult expects
	payload := map[string]any{
		"classification": alert.GPTClassification,
		"reasoning":      strings.Split(alert.GPTReasoning, config.LOGS_SEPARATOR),
		"nextSteps":      buildNextStepsPayload(alert.GPTNextSteps),
		"modelVersion":   cfg.Model,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal result payload: %v", err)
	}

	url := fmt.Sprintf("%s/api/soc-ai/result/%s", cfg.Backend, alert.Id)
	headers := map[string]string{
		"Content-Type":     "application/json",
		"Utm-Internal-Key": cfg.InternalKey,
	}

	body, statusCode, err := utils.DoReq(url, payloadBytes, "POST", headers, config.HTTP_TIMEOUT)
	if err != nil || (statusCode != http.StatusOK && statusCode != http.StatusCreated) {
		return fmt.Errorf("backend POST failed (status %d): %v — body: %s", statusCode, err, string(body))
	}

	catcher.Info("Result posted to backend successfully", map[string]any{
		"process": "plugin_com.hivearmor.soc-ai",
		"alertId": alert.Id,
		"status":  statusCode,
	})
	return nil
}

// buildNextStepsPayload converts "Action:: Details\n..." into [{action, details}]
func buildNextStepsPayload(gptNextSteps string) []map[string]string {
	steps := []map[string]string{}
	for _, line := range strings.Split(gptNextSteps, "\n") {
		parts := strings.SplitN(line, "::", 2)
		if len(parts) == 2 {
			steps = append(steps, map[string]string{
				"action":  strings.TrimSpace(parts[0]),
				"details": strings.TrimSpace(parts[1]),
			})
		}
	}
	return steps
}
