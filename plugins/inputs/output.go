package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"time"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/threatwinds/go-sdk/plugins"
	"github.com/threatwinds/go-sdk/utils"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func sendLog() {
	var socketsFolder utils.Folder
	var err error
	var socketFile string
	var conn *grpc.ClientConn
	var client plugins.EngineClient
	var inputClient plugins.Engine_InputClient

	secret := getSocketSecret()

	for {
		socketsFolder, err = utils.MkdirJoin(plugins.WorkDir, "sockets")
		if err != nil {
			_ = catcher.Error("cannot create socket directory", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
			time.Sleep(5 * time.Second)
			continue
		}

		socketFile = socketsFolder.FileJoin("engine_server.sock")

		conn, err = grpc.NewClient(
			fmt.Sprintf("unix://%s", socketFile),
			grpc.WithTransportCredentials(insecure.NewCredentials()),
			grpc.WithContextDialer(secretDialer(secret)),
		)
		if err != nil {
			_ = catcher.Error("failed to connect to engine server", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
			time.Sleep(5 * time.Second)
			continue
		}

		client = plugins.NewEngineClient(conn)

		inputClient, err = client.Input(context.Background())
		if err != nil {
			_ = catcher.Error("failed to create input client", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
			if conn != nil {
				_ = conn.Close()
			}
			time.Sleep(5 * time.Second)
			continue
		}

		break
	}

	defer conn.Close()

	var restart = make(chan bool)

	go func() {
		for {
			entry := <-localLogsChannel

			if err := inputClient.Send(entry.log); err != nil {
				entry.result <- err
				_ = catcher.Error("failed to send log to engine", err, map[string]any{
					"process": "plugin_com.hivearmor.inputs",
					"lastId":  entry.log.Id,
				})
				restart <- true
				return
			}

			// Wait for the engine to ack this specific log before signalling
			// the caller — this is what makes the collector-facing Ack reliable.
			_, ackErr := inputClient.Recv()
			if ackErr != nil {
				entry.result <- ackErr
				_ = catcher.Error("failed to receive ack from engine", ackErr, map[string]any{
					"process": "plugin_com.hivearmor.inputs",
					"lastId":  entry.log.Id,
				})
				restart <- true
				return
			}

			entry.result <- nil
		}
	}()

	select {
	case <-restart:
		time.Sleep(5 * time.Second)
		go sendLog()
		return
	}
}

// secretDialer returns a gRPC context dialer that sends the shared secret immediately
// after establishing the unix connection, before the gRPC handshake begins.
func secretDialer(secret string) func(context.Context, string) (net.Conn, error) {
	return func(ctx context.Context, addr string) (net.Conn, error) {
		conn, err := (&net.Dialer{}).DialContext(ctx, "unix", addr)
		if err != nil {
			return nil, err
		}

		conn.SetDeadline(time.Now().Add(5 * time.Second))
		if _, err := conn.Write([]byte(secret)); err != nil {
			conn.Close()
			return nil, fmt.Errorf("socket auth write failed: %w", err)
		}
		conn.SetDeadline(time.Time{})

		return conn, nil
	}
}

// getSocketSecret reads the shared secret from the environment.
func getSocketSecret() string {
	if v := os.Getenv("INPUTS_SOCKET_SECRET"); v != "" {
		return v
	}
	return "change-me-in-production"
}

// sendViaSocket opens a fresh socket connection, sends one log, waits for the
// ack, and closes. Used by kafkaSendLog() as a fallback when Kafka fails.
func sendViaSocket(log *plugins.Log) error {
	var socketsFolder utils.Folder
	var err error

	socketsFolder, err = utils.MkdirJoin(plugins.WorkDir, "sockets")
	if err != nil {
		return err
	}

	socketFile := socketsFolder.FileJoin("engine_server.sock")
	secret := getSocketSecret()

	conn, err := grpc.NewClient(
		fmt.Sprintf("unix://%s", socketFile),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithContextDialer(secretDialer(secret)),
	)
	if err != nil {
		return err
	}
	defer conn.Close()

	inputClient, err := plugins.NewEngineClient(conn).Input(context.Background())
	if err != nil {
		return err
	}

	if err := inputClient.Send(log); err != nil {
		return err
	}

	_, err = inputClient.Recv()
	return err
}
