package http

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hivearmor/sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"

	"github.com/hivearmor/event-processor/compliance"
	"github.com/hivearmor/event-processor/config"
	"github.com/hivearmor/event-processor/enrichment"
	"github.com/hivearmor/event-processor/enterprise/baseline"
	"github.com/hivearmor/event-processor/enterprise/lookup"
	"github.com/hivearmor/event-processor/enterprise/offense"
	"github.com/hivearmor/event-processor/enterprise/sequence"
	"github.com/hivearmor/event-processor/pipeline"
	"github.com/hivearmor/event-processor/processor"
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

	if err := processor.BindTenant(event); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "tenant resolve failed"})
		return
	}

	// Enrichment
	lookup.Enrich(event)
	enrichGeoOnEvent(event)

	alerts := rulesengine.Evaluate(event)
	outcome := processor.ProcessingOutcome{Event: event, Alerts: alerts}
	if err := processor.PersistRequired(outcome, processor.DefaultStore()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "required persist failed"})
		return
	}
	var alertIDs []string
	for _, alert := range alerts {
		go offense.Process(alert)
		alertIDs = append(alertIDs, alert.Id)
	}

	sequence.Process(event)

	// Evaluate anomaly detection against hourly baselines.
	baseline.EvaluateEvent(event)

	complianceHits := compliance.Evaluate(event)
	if len(complianceHits) > 0 {
		go compliance.WriteComplianceEvidence(complianceHits)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "processed",
		"id":         event.Id,
		"index":      writer.EventIndex(event),
		"alerts":     len(alertIDs),
		"alertIds":   alertIDs,
		"compliance": len(complianceHits),
	})
}

// enrichGeoOnEvent writes geolocation data directly to the Event proto fields
// for both origin and target sides. This replaces the throwaway-map pattern.
func enrichGeoOnEvent(e *plugins.Event) {
	enrichSideGeo(e.Origin)
	enrichSideGeo(e.Target)
}

// enrichSideGeo performs geo enrichment on a single Side, writing results
// directly to the Geolocation proto field.
func enrichSideGeo(side *plugins.Side) {
	if side == nil || side.Ip == "" {
		return
	}
	geo := enrichment.Geolocate(side.Ip)
	if geo == nil {
		return
	}
	side.Geolocation = geoMapToProto(geo)
}

// geoMapToProto converts the enrichment map[string]any result into a proto Geolocation struct.
func geoMapToProto(m map[string]any) *plugins.Geolocation {
	g := &plugins.Geolocation{}
	if v, ok := m["country"].(string); ok {
		g.Country = v
	}
	if v, ok := m["city"].(string); ok {
		g.City = v
	}
	if v, ok := m["countryCode"].(string); ok {
		g.CountryCode = v
	}
	if v, ok := m["latitude"].(float64); ok {
		g.Latitude = v
	}
	if v, ok := m["longitude"].(float64); ok {
		g.Longitude = v
	}
	if v, ok := m["accuracy"].(int); ok {
		g.Accuracy = uint32(v)
	}
	if v, ok := m["asn"].(string); ok && len(v) > 2 {
		if n, err := strconv.ParseUint(v[2:], 10, 64); err == nil {
			g.Asn = n
		}
	}
	if v, ok := m["aso"].(string); ok {
		g.Aso = v
	}
	return g
}
