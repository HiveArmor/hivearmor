package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"net"
	"net/http"
	"time"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/threatwinds/go-sdk/plugins"
	"github.com/threatwinds/go-sdk/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/health"
	grpcHealth "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func startHTTPServer(middlewares *Middlewares, cert string, key string) {
	maxRetries := 3
	retryDelay := 2 * time.Second

	gin.SetMode(gin.ReleaseMode)

	router := gin.Default()
	router.Use(middlewares.LimitBody())
	router.POST("/v1/logs", middlewares.HttpAuth(), Log)
	router.POST("/v1/github-webhook", middlewares.GitHubAuth(), GitHub)
	router.GET("/v1/ping", Ping)
	router.GET("/v1/health", func(c *gin.Context) { c.Status(http.StatusOK) })

	var loadedCert tls.Certificate
	var err error

	for retry := 0; retry < maxRetries; retry++ {
		loadedCert, err = tls.LoadX509KeyPair(cert, key)

		if err == nil {
			break
		}

		_ = catcher.Error("failed to read the certificate files, retrying", err, map[string]any{
			"process":    "plugin_com.hivearmor.inputs",
			"retry":      retry + 1,
			"maxRetries": maxRetries,
		})

		if retry < maxRetries-1 {
			time.Sleep(retryDelay)
			retryDelay *= 2
		} else {
			_ = catcher.Error("could not read the certificate files, all retries failed", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
			return
		}
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{loadedCert},
		MinVersion:   tls.VersionTLS13,
	}

	server := &http.Server{
		Addr:      ":8080",
		Handler:   router,
		TLSConfig: tlsConfig,
	}

	err = server.ListenAndServeTLS("", "")
	if err != nil {
		_ = catcher.Error("could not start http server", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
	}
}

func Log(c *gin.Context) {
	buf := new(bytes.Buffer)

	_, err := buf.ReadFrom(c.Request.Body)
	if err != nil {
		writeMaxBytesOrError(c, err, "failed to read request body")
		return
	}

	body := buf.String()

	var l = new(plugins.Log)

	err = utils.StringToProtoMessage(&body, l)
	if err != nil {
		e := catcher.Error("failed to parse log", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
		e.GinError(c)
		return
	}

	identity := identityFromContext(c.Request.Context())
	if err := prepareIngressLog(l, identity); err != nil {
		writeIdentityBindError(c, err)
		return
	}

	if err := enqueueLog(c.Request.Context(), l, identity, func(status int, payload gin.H) {
		if status == http.StatusTooManyRequests || status == http.StatusServiceUnavailable {
			c.Header("Retry-After", "1")
		}
		c.JSON(status, payload)
	}); err != nil {
		return
	}

	c.JSON(http.StatusOK, plugins.Ack{LastId: l.Id})
}

func Ping(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ping": "ok"})
}

func GitHub(c *gin.Context) {
	c.JSON(http.StatusForbidden, gin.H{"error": errMissingIdentity.Error()})
}

func enqueueLog(ctx context.Context, l *plugins.Log, identity *ConnectorIdentity, writeHTTP func(int, gin.H)) error {
	entry := &logEntry{log: l, identity: identity, result: make(chan error, 1)}

	select {
	case localLogsChannel <- entry:
	default:
		if writeHTTP != nil {
			writeHTTP(http.StatusServiceUnavailable, gin.H{"error": "input channel full, retry later"})
			return errChannelFull
		}
		return status.Error(codes.ResourceExhausted, "input channel full, rejecting log for retry; retry-after=1")
	}

	select {
	case deliveryErr := <-entry.result:
		if deliveryErr != nil {
			return catcher.Error("failed to deliver log to engine", deliveryErr, map[string]any{
				"process": "plugin_com.hivearmor.inputs",
				"lastId":  l.Id,
			})
		}
	case <-ctx.Done():
		if writeHTTP != nil {
			writeHTTP(http.StatusServiceUnavailable, gin.H{"error": "request cancelled before delivery"})
			return ctx.Err()
		}
		return ctx.Err()
	}
	return nil
}

func writeIdentityBindError(c *gin.Context, err error) {
	httpStatus := http.StatusForbidden
	if errors.Is(err, errTenantConflict) {
		httpStatus = http.StatusConflict
	}
	e := catcher.Error("cannot bind connector identity", err, map[string]any{"process": "plugin_com.hivearmor.inputs", "status": httpStatus})
	e.GinError(c)
}

func prepareIngressLog(l *plugins.Log, identity *ConnectorIdentity) error {
	if err := bindLogIdentity(l, identity); err != nil {
		return err
	}
	if l.Id == "" {
		l.Id = uuid.New().String()
	}
	if l.DataType == "" {
		l.DataType = "generic"
	}
	if l.Timestamp == "" {
		l.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}
	return nil
}

var errChannelFull = errors.New("input channel full")

type integration struct {
	plugins.UnimplementedIntegrationServer
}

func startGRPCServer(middlewares *Middlewares, cert string, key string) error {
	maxRetries := 3
	retryDelay := 2 * time.Second
	var loadedCert tls.Certificate
	var err error

	for retry := 0; retry < maxRetries; retry++ {

		loadedCert, err = tls.LoadX509KeyPair(cert, key)
		if err == nil {
			break
		}

		_ = catcher.Error("failed to read the certificate files, retrying", err, map[string]any{
			"process":    "plugin_com.hivearmor.inputs",
			"retry":      retry + 1,
			"maxRetries": maxRetries,
		})

		if retry < maxRetries-1 {
			time.Sleep(retryDelay)
			retryDelay *= 2
		} else {
			return catcher.Error("could not read the certificate files, all retries failed", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
		}
	}

	transportCredentials := credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{loadedCert},
		MinVersion:   tls.VersionTLS13,
	})

	server := grpc.NewServer(
		grpc.Creds(transportCredentials),
		grpc.MaxRecvMsgSize(maxMessageBytes),
		grpc.MaxSendMsgSize(maxMessageBytes),
		grpc.ChainUnaryInterceptor(middlewares.GrpcAuth),
		grpc.ChainStreamInterceptor(middlewares.GrpcStreamAuth),
	)

	integrationInstance := new(integration)

	plugins.RegisterIntegrationServer(server, integrationInstance)
	healthServer := health.NewServer()
	grpcHealth.RegisterHealthServer(server, healthServer)
	healthServer.SetServingStatus("", grpcHealth.HealthCheckResponse_SERVING)

	retryDelay = 2 * time.Second
	var listener net.Listener

	for retry := 0; retry < maxRetries; retry++ {
		listener, err = net.Listen("tcp", "0.0.0.0:50051")
		if err == nil {
			break
		}

		_ = catcher.Error("failed to listen to grpc, retrying", err, map[string]any{
			"process":    "plugin_com.hivearmor.inputs",
			"retry":      retry + 1,
			"maxRetries": maxRetries,
		})

		if retry < maxRetries-1 {
			time.Sleep(retryDelay)
			retryDelay *= 2
		} else {
			return catcher.Error("all retries failed when listening to grpc", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
		}
	}

	if err := server.Serve(listener); err != nil {
		return catcher.Error("failed to serve grpc", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
	}

	return nil
}

func (i *integration) ProcessLog(srv plugins.Integration_ProcessLogServer) error {
	identity := identityFromContext(srv.Context())
	for {
		l, err := srv.Recv()
		if err != nil {
			return err
		}

		if err := prepareIngressLog(l, identity); err != nil {
			return identityBindStatus(err)
		}
		if logAuth != nil {
			if wait, ok := logAuth.limiter.Allow(identity, nowUTC()); !ok {
				_ = grpc.SetHeader(srv.Context(), metadata.Pairs("retry-after", retryAfterSeconds(wait)))
				return status.Error(codes.ResourceExhausted, "rate limit exceeded; retry-after=1")
			}
		}

		if err := enqueueLog(srv.Context(), l, identity, nil); err != nil {
			if status.Code(err) == codes.ResourceExhausted {
				_ = grpc.SetHeader(srv.Context(), metadata.Pairs("retry-after", "1"))
			}
			return err
		}

		if err := srv.Send(&plugins.Ack{LastId: l.Id}); err != nil {
			return catcher.Error("failed to send ack", err, map[string]any{
				"process": "plugin_com.hivearmor.inputs",
				"lastId":  l.Id,
			})
		}
	}
}

func identityBindStatus(err error) error {
	switch {
	case errors.Is(err, errTenantConflict):
		return status.Error(codes.PermissionDenied, err.Error())
	case errors.Is(err, errMissingIdentity), errors.Is(err, errTenantUnbound), errors.Is(err, errIdentityRevoked):
		return status.Error(codes.PermissionDenied, err.Error())
	default:
		return status.Error(codes.InvalidArgument, err.Error())
	}
}
