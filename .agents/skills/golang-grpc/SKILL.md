---
name: golang-grpc
description: Production gRPC in Go — protobuf organization, streaming, interceptors, error codes, TLS, code generation. Use when working on agent-manager gRPC server or event-processor gRPC endpoints.
metadata:
  type: skill
  source: samber/cc-skills-golang (adapted)
---

# Go gRPC Patterns

## When This Skill Applies
- Any work in `agent-manager/`, `event-processor/grpc/`
- Adding new gRPC services, interceptors, or streaming handlers
- TLS configuration for agent ↔ agent-manager communication

## Proto Organization
```
proto/
  hivearmor/
    agent/v1/
      agent.proto       # agent registration, heartbeat
      command.proto     # remote commands
    eventprocessor/v1/
      ingest.proto      # event ingestion
```
Rules:
- One service per file
- Package: `hivearmor.<domain>.v1`
- Go option: `option go_package = "github.com/hivearmor/<svc>/gen/pb;<svc>pb";`

## Service Implementation Pattern
```go
type AgentManagerServer struct {
    pb.UnimplementedAgentManagerServer  // always embed — future-proofs additions
    registry AgentRegistry
    logger   *slog.Logger
}

func (s *AgentManagerServer) Register(ctx context.Context, req *pb.RegisterRequest) (*pb.RegisterResponse, error) {
    if err := req.Validate(); err != nil {
        return nil, status.Errorf(codes.InvalidArgument, "invalid request: %v", err)
    }
    // business logic
    return &pb.RegisterResponse{AgentId: id}, nil
}
```

## Interceptors (use for auth + logging)
```go
func authInterceptor(internalKey string) grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
        md, ok := metadata.FromIncomingContext(ctx)
        if !ok || len(md.Get("x-internal-key")) == 0 || md.Get("x-internal-key")[0] != internalKey {
            return nil, status.Error(codes.Unauthenticated, "missing or invalid internal key")
        }
        return handler(ctx, req)
    }
}

// Wire at server creation:
grpc.NewServer(
    grpc.UnaryInterceptor(authInterceptor(os.Getenv("INTERNAL_KEY"))),
    grpc.ChainStreamInterceptor(loggingStreamInterceptor, authStreamInterceptor),
)
```

## Error Codes — Use Standard gRPC Codes
| Situation | Code |
|---|---|
| Bad input | `codes.InvalidArgument` |
| Not found | `codes.NotFound` |
| Auth failure | `codes.Unauthenticated` |
| Permission denied | `codes.PermissionDenied` |
| Already exists | `codes.AlreadyExists` |
| Transient (retry) | `codes.Unavailable` |
| Internal bug | `codes.Internal` |

## TLS Configuration (replace InsecureTrustManagerFactory — SEC-04)
```go
// Server-side mTLS
creds, err := credentials.NewServerTLSFromFile("server.crt", "server.key")

// Client-side (agent connecting to agent-manager)
creds, err := credentials.NewClientTLSFromFile("ca.crt", "")
conn, err := grpc.Dial(addr, grpc.WithTransportCredentials(creds))
```
Never use `credentials.NewTLS(&tls.Config{InsecureSkipVerify: true})` in new code — this is SEC-04.

## Bidirectional Streaming (agent command channel)
```go
func (s *AgentManagerServer) CommandStream(stream pb.AgentManager_CommandStreamServer) error {
    ctx := stream.Context()
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case cmd := <-s.commandQueue:
            if err := stream.Send(cmd); err != nil {
                return err
            }
        }
    }
}
```

## Code Generation
```bash
protoc --go_out=. --go_opt=paths=source_relative \
       --go-grpc_out=. --go-grpc_opt=paths=source_relative \
       proto/hivearmor/agent/v1/agent.proto
```
Always commit generated `*.pb.go` files — do not `.gitignore` them.
