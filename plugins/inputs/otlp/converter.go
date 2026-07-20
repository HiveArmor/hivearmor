package otlp

import (
	"encoding/json"
	"fmt"
	"time"

	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
)

// LogEvent is the intermediate struct forwarded to localLogsChannel via publish.
// Fields map to plugins.Log conventions used by the rest of the inputs plugin.
type LogEvent struct {
	ID         string `json:"id"`
	Timestamp  string `json:"timestamp"`
	DataType   string `json:"dataType"`
	DataSource string `json:"dataSource"`
	Message    string `json:"message"`
	Host       string `json:"host"`
	// Raw carries the full attribute bag as a JSON object for downstream filters.
	Raw string `json:"raw"`
}

func convertToLogEvent(resource *resourcepb.Resource, scope *commonpb.InstrumentationScope, record *logspb.LogRecord) LogEvent {
	ts := timestampNano(record.TimeUnixNano)
	if ts == "" {
		ts = time.Now().UTC().Format(time.RFC3339Nano)
	}

	attrs := mergeAttributes(resource, scope, record)
	nestK8sAttributes(attrs)
	raw, _ := json.Marshal(attrs)

	msg := record.GetBody().GetStringValue()
	if msg == "" {
		msg = string(raw)
	}

	source := attrString(resource.GetAttributes(), "service.name")
	if source == "" {
		source = attrString(resource.GetAttributes(), "telemetry.sdk.name")
	}
	if source == "" {
		source = "otlp"
	}

	host := attrString(resource.GetAttributes(), "host.name")
	if host == "" {
		host = attrString(resource.GetAttributes(), "k8s.node.name")
	}

	return LogEvent{
		Timestamp:  ts,
		DataType:   "otlp",
		DataSource: source,
		Message:    msg,
		Host:       host,
		Raw:        string(raw),
	}
}

// nestK8sAttributes lifts OTel semconv k8s.* keys into a nested "k8s" map
// so that downstream filter YAML can use standard dot-path notation
// (e.g. log.k8s.podName) instead of flat dotted-key GJSON bracket syntax.
// The original flat keys are removed to avoid duplication.
//
// Mapping (OTel semconv → nested field):
//
//	k8s.pod.name        → k8s.podName
//	k8s.namespace.name  → k8s.namespace
//	k8s.container.name  → k8s.containerName
//	k8s.node.name       → k8s.nodeName
//	k8s.cluster.name    → k8s.clusterName
//	service.name        → k8s.serviceName  (only when k8s attrs present)
func nestK8sAttributes(attrs map[string]any) {
	mapping := map[string]string{
		"k8s.pod.name":       "podName",
		"k8s.namespace.name": "namespace",
		"k8s.container.name": "containerName",
		"k8s.node.name":      "nodeName",
		"k8s.cluster.name":   "clusterName",
	}

	k8s := map[string]any{}
	for flat, nested := range mapping {
		if v, ok := attrs[flat]; ok {
			k8s[nested] = v
			delete(attrs, flat)
		}
	}
	if len(k8s) == 0 {
		return
	}
	// Promote service.name into the k8s namespace when this is a k8s event.
	if v, ok := attrs["service.name"]; ok {
		k8s["serviceName"] = v
		delete(attrs, "service.name")
	}
	attrs["k8s"] = k8s
}

// mergeAttributes flattens resource, scope, and record attributes into one map.
// Record attributes take precedence over resource attributes on collision.
func mergeAttributes(resource *resourcepb.Resource, scope *commonpb.InstrumentationScope, record *logspb.LogRecord) map[string]any {
	out := make(map[string]any)

	for _, kv := range resource.GetAttributes() {
		out[kv.GetKey()] = anyValue(kv.GetValue())
	}
	if scope != nil && scope.Name != "" {
		out["otel.scope.name"] = scope.Name
		if scope.Version != "" {
			out["otel.scope.version"] = scope.Version
		}
	}
	for _, kv := range record.GetAttributes() {
		out[kv.GetKey()] = anyValue(kv.GetValue())
	}

	if record.SeverityText != "" {
		out["severity"] = record.SeverityText
	}
	if record.TraceId != nil {
		out["traceId"] = fmt.Sprintf("%x", record.TraceId)
	}
	if record.SpanId != nil {
		out["spanId"] = fmt.Sprintf("%x", record.SpanId)
	}

	return out
}

func anyValue(v *commonpb.AnyValue) any {
	if v == nil {
		return nil
	}
	switch val := v.Value.(type) {
	case *commonpb.AnyValue_StringValue:
		return val.StringValue
	case *commonpb.AnyValue_BoolValue:
		return val.BoolValue
	case *commonpb.AnyValue_IntValue:
		return val.IntValue
	case *commonpb.AnyValue_DoubleValue:
		return val.DoubleValue
	case *commonpb.AnyValue_BytesValue:
		return fmt.Sprintf("%x", val.BytesValue)
	case *commonpb.AnyValue_ArrayValue:
		arr := make([]any, 0, len(val.ArrayValue.GetValues()))
		for _, item := range val.ArrayValue.GetValues() {
			arr = append(arr, anyValue(item))
		}
		return arr
	case *commonpb.AnyValue_KvlistValue:
		m := make(map[string]any, len(val.KvlistValue.GetValues()))
		for _, kv := range val.KvlistValue.GetValues() {
			m[kv.GetKey()] = anyValue(kv.GetValue())
		}
		return m
	}
	return nil
}

func attrString(attrs []*commonpb.KeyValue, key string) string {
	for _, kv := range attrs {
		if kv.GetKey() == key {
			return kv.GetValue().GetStringValue()
		}
	}
	return ""
}

func timestampNano(ns uint64) string {
	if ns == 0 {
		return ""
	}
	t := time.Unix(0, int64(ns)).UTC()
	return t.Format(time.RFC3339Nano)
}
