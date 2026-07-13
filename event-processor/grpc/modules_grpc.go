package grpc

import (
	"net"

	"google.golang.org/grpc"
)

// StartModulesGRPC starts the gRPC server on :9003 used by companion plugins.
func StartModulesGRPC() error {
	lis, err := net.Listen("tcp", ":9003")
	if err != nil {
		return err
	}
	srv := grpc.NewServer()
	// Modules-config service registration happens in http/modules.go;
	// gRPC is a plain server endpoint for now — plugins use the REST API.
	go srv.Serve(lis)
	return nil
}
