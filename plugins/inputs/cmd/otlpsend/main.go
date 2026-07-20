// Standalone validation sender for Sprint 09 T01.
// Usage: go run ./cmd/otlpsend [endpoint] [message]
// Default endpoint: localhost:4317
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	collectorpb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	endpoint := "localhost:4317"
	message := "OTLP validation test log — HiveArmor Sprint 09 T01"
	if len(os.Args) >= 2 {
		endpoint = os.Args[1]
	}
	if len(os.Args) >= 3 {
		message = os.Args[2]
	}

	log.Printf("Connecting to OTLP gRPC endpoint: %s", endpoint)
	conn, err := grpc.NewClient(endpoint,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		log.Fatalf("grpc.NewClient: %v", err)
	}
	defer conn.Close()

	client := collectorpb.NewLogsServiceClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req := &collectorpb.ExportLogsServiceRequest{
		ResourceLogs: []*logspb.ResourceLogs{
			{
				Resource: &resourcepb.Resource{
					Attributes: []*commonpb.KeyValue{
						kv("service.name", "hivearmor-validation"),
						kv("host.name", "test-host"),
						kv("deployment.environment", "local-dev"),
					},
				},
				ScopeLogs: []*logspb.ScopeLogs{
					{
						Scope: &commonpb.InstrumentationScope{
							Name:    "sprint09-t01-validator",
							Version: "1.0.0",
						},
						LogRecords: []*logspb.LogRecord{
							{
								TimeUnixNano: uint64(time.Now().UnixNano()),
								SeverityText: "INFO",
								SeverityNumber: logspb.SeverityNumber_SEVERITY_NUMBER_INFO,
								Body: &commonpb.AnyValue{
									Value: &commonpb.AnyValue_StringValue{StringValue: message},
								},
								Attributes: []*commonpb.KeyValue{
									kv("test.sprint", "09"),
									kv("test.task", "T01"),
									kv("validation", "true"),
								},
							},
						},
					},
				},
			},
		},
	}

	log.Printf("Sending 1 OTLP log record...")
	resp, err := client.Export(ctx, req)
	if err != nil {
		log.Fatalf("Export RPC failed: %v", err)
	}

	partial := resp.GetPartialSuccess()
	if partial != nil && partial.RejectedLogRecords > 0 {
		fmt.Printf("PARTIAL_SUCCESS: %d records rejected — %s\n", partial.RejectedLogRecords, partial.ErrorMessage)
		os.Exit(1)
	}

	fmt.Printf("SUCCESS: Export accepted by server (0 rejected)\n")
	fmt.Printf("  endpoint: %s\n", endpoint)
	fmt.Printf("  message:  %s\n", message)
}

func kv(k, v string) *commonpb.KeyValue {
	return &commonpb.KeyValue{
		Key:   k,
		Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: v}},
	}
}
