package otlp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"

	collectorpb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	"google.golang.org/grpc"
)

const maxRecvMsgSize = 64 * 1024 * 1024 // 64 MB

// logsServiceServer implements the OTLP Logs Service.
type logsServiceServer struct {
	collectorpb.UnimplementedLogsServiceServer
	publish func([]byte) error
}

// Export receives a batch of OTLP log records, converts each to a HiveArmor
// LogEvent, and forwards the JSON payload to the shared publish function.
func (s *logsServiceServer) Export(ctx context.Context, req *collectorpb.ExportLogsServiceRequest) (*collectorpb.ExportLogsServiceResponse, error) {
	for _, resourceLog := range req.GetResourceLogs() {
		resource := resourceLog.GetResource()
		for _, scopeLog := range resourceLog.GetScopeLogs() {
			scope := scopeLog.GetScope()
			for _, record := range scopeLog.GetLogRecords() {
				event := convertToLogEvent(resource, scope, record)
				payload, err := json.Marshal(event)
				if err != nil {
					log.Printf("otlp: marshal error: %v", err)
					continue
				}
				if err := s.publish(payload); err != nil {
					log.Printf("otlp: publish error: %v", err)
				}
			}
		}
	}
	return &collectorpb.ExportLogsServiceResponse{}, nil
}

// StartOtlpReceiver starts a plain-text (insecure) gRPC OTLP Logs receiver on
// the given port. Every received log record is passed as JSON to publish.
// The function blocks until the server exits; run it in a goroutine.
func StartOtlpReceiver(port int, publish func([]byte) error) error {
	addr := fmt.Sprintf(":%d", port)
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("otlp: listen %s: %w", addr, err)
	}

	srv := grpc.NewServer(
		grpc.MaxRecvMsgSize(maxRecvMsgSize),
	)
	collectorpb.RegisterLogsServiceServer(srv, &logsServiceServer{publish: publish})

	log.Printf("OTLP gRPC receiver listening on %s", addr)
	return srv.Serve(lis)
}
