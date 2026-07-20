package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/threatwinds/go-sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"

	"github.com/hivearmor/event-processor/compliance"
	"github.com/hivearmor/event-processor/config"
	"github.com/hivearmor/event-processor/enrichment"
	"github.com/hivearmor/event-processor/enterprise/lookup"
	"github.com/hivearmor/event-processor/enterprise/offense"
	"github.com/hivearmor/event-processor/pipeline"
	rulesengine "github.com/hivearmor/event-processor/rules"
	"github.com/hivearmor/event-processor/writer"
)

func registerIngestRoutes(r *gin.Engine) {
	r.POST("/v1/inject", injectKeyAuth(config.InjectAPIKey), handleInject)
}

// InjectRequest represents a synthetic log to inject for testing.
// Either Raw (unparsed syslog) or Log (pre-parsed fields) must be set.
type InjectRequest struct {
	DataType   string            `json:"dataType" binding:"required"`
	DataSource string            `json:"dataSource"`
	TenantID   string            `json:"tenantId"`
	Raw        string            `json:"raw"`
	OriginIP   string            `json:"originIp"`
	OriginUser string            `json:"originUser"`
	TargetIP   string            `json:"targetIp"`
	Log        map[string]string `json:"log"`
}

func handleInject(c *gin.Context) {
	var req InjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	logMsg := &plugins.Log{
		Id:         uuid.New().String(),
		DataType:   req.DataType,
		DataSource: req.DataSource,
		TenantId:   req.TenantID,
		Raw:        req.Raw,
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
	}

	event := pipeline.Execute(logMsg)
	if event == nil {
		c.JSON(http.StatusOK, gin.H{"status": "dropped", "id": logMsg.Id})
		return
	}

	// Apply pre-parsed fields from request (bypasses pipeline when no filter exists)
	if req.OriginIP != "" || req.OriginUser != "" {
		if event.Origin == nil {
			event.Origin = &plugins.Side{}
		}
		if req.OriginIP != "" {
			event.Origin.Ip = req.OriginIP
		}
		if req.OriginUser != "" {
			event.Origin.User = req.OriginUser
		}
	}
	if req.TargetIP != "" {
		if event.Target == nil {
			event.Target = &plugins.Side{}
		}
		event.Target.Ip = req.TargetIP
	}
	for k, v := range req.Log {
		event.Log[k] = structpb.NewStringValue(v)
	}

	// Enrichment
	lookup.Enrich(event)
	enrichment.EnrichEvent(ingestEventMap(event))

	writer.WriteEvent(event)

	alerts := rulesengine.Evaluate(event)
	var alertIDs []string
	for _, alert := range alerts {
		writer.WriteAlert(alert)
		go offense.Process(alert)
		alertIDs = append(alertIDs, alert.Id)
	}

	complianceHits := compliance.Evaluate(event)
	if len(complianceHits) > 0 {
		go compliance.WriteComplianceEvidence(complianceHits)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "processed",
		"id":         event.Id,
		"index":      "_v3_hive_log-" + event.DataType,
		"alerts":     len(alertIDs),
		"alertIds":   alertIDs,
		"compliance": len(complianceHits),
	})
}

func ingestEventMap(e *plugins.Event) map[string]any {
	m := map[string]any{}
	if e.Origin != nil {
		m["origin"] = map[string]any{"ip": e.Origin.Ip}
	}
	if e.Target != nil {
		m["target"] = map[string]any{"ip": e.Target.Ip}
	}
	return m
}
