package grpc

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"time"

	"github.com/threatwinds/go-sdk/plugins"
	"google.golang.org/grpc"

	"github.com/hivearmor/event-processor/enrichment"
	"github.com/hivearmor/event-processor/enterprise/lookup"
	"github.com/hivearmor/event-processor/enterprise/offense"
	"github.com/hivearmor/event-processor/pipeline"
	rulesengine "github.com/hivearmor/event-processor/rules"
	"github.com/hivearmor/event-processor/writer"
)

// StartEngineSocket starts the unix-socket gRPC server that accepts logs from the inputs plugin.
func StartEngineSocket(workDir, secret string) error {
	sockPath := filepath.Join(workDir, "sockets", "engine_server.sock")

	lis, err := createSocket(sockPath)
	if err != nil {
		return err
	}

	srv := grpc.NewServer()
	plugins.RegisterEngineServer(srv, &engineServer{})
	go srv.Serve(&authListener{inner: lis, secret: secret})
	return nil
}

// createSocket removes any stale socket, creates a new one, and locks it to owner-only (0600).
func createSocket(sockPath string) (net.Listener, error) {
	_ = os.Remove(sockPath)
	if err := os.MkdirAll(filepath.Dir(sockPath), 0o755); err != nil {
		return nil, fmt.Errorf("cannot create socket directory: %w", err)
	}

	lis, err := net.Listen("unix", sockPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create unix socket at %s: %w", sockPath, err)
	}

	if err := os.Chmod(sockPath, 0o600); err != nil {
		lis.Close()
		return nil, fmt.Errorf("failed to set socket permissions: %w", err)
	}

	return lis, nil
}

// authListener wraps a net.Listener and performs a shared-secret handshake on every accepted
// connection before handing the connection to gRPC. Connections that fail the handshake are
// closed immediately and never surfaced to the caller.
type authListener struct {
	inner  net.Listener
	secret string
}

func (a *authListener) Accept() (net.Conn, error) {
	for {
		conn, err := a.inner.Accept()
		if err != nil {
			return nil, err
		}

		if err := checkHandshake(conn, a.secret); err != nil {
			conn.Close()
			continue
		}

		return conn, nil
	}
}

func (a *authListener) Close() error   { return a.inner.Close() }
func (a *authListener) Addr() net.Addr { return a.inner.Addr() }

// checkHandshake reads exactly len(secret) bytes from conn within 5 s and compares
// them to the expected secret using a constant-time comparison.
func checkHandshake(conn net.Conn, secret string) error {
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	defer conn.SetDeadline(time.Time{})

	buf := make([]byte, len(secret))
	if _, err := io.ReadFull(conn, buf); err != nil {
		return fmt.Errorf("socket auth read failed: %w", err)
	}

	// Constant-time comparison to prevent timing attacks.
	if !constantEqual(buf, []byte(secret)) {
		return fmt.Errorf("socket auth failed: wrong secret")
	}

	return nil
}

// constantEqual compares two byte slices in constant time.
func constantEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	var diff byte
	for i := range a {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
}

type engineServer struct {
	plugins.UnimplementedEngineServer
}

func (e *engineServer) Input(stream plugins.Engine_InputServer) error {
	for {
		log, err := stream.Recv()
		if err != nil {
			return err
		}
		go processLog(log)
		stream.Send(&plugins.Ack{LastId: log.Id})
	}
}

func (e *engineServer) Notify(stream plugins.Engine_NotifyServer) error {
	for {
		_, err := stream.Recv()
		if err != nil {
			return err
		}
		stream.Send(&plugins.Ack{})
	}
}

func processLog(log *plugins.Log) {
	event := pipeline.Execute(log)
	if event == nil {
		return
	}

	lookup.Enrich(event)
	enrichment.EnrichEvent(eventDataMap(event))

	writer.WriteEvent(event)

	alerts := rulesengine.Evaluate(event)
	for _, alert := range alerts {
		writer.WriteAlert(alert)
		go offense.Process(alert)
	}
}

func eventDataMap(e *plugins.Event) map[string]any {
	m := map[string]any{}
	if e.Origin != nil {
		m["origin"] = map[string]any{"ip": e.Origin.Ip}
	}
	if e.Target != nil {
		m["target"] = map[string]any{"ip": e.Target.Ip}
	}
	return m
}
