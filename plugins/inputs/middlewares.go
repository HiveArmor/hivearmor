package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/threatwinds/go-sdk/catcher"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type identityContextKey struct{}

type Middlewares struct {
	AuthService *LogAuthService
}

func NewMiddlewares(authService *LogAuthService) *Middlewares {
	return &Middlewares{
		AuthService: authService,
	}
}

func identityFromContext(ctx context.Context) *ConnectorIdentity {
	identity, _ := ctx.Value(identityContextKey{}).(*ConnectorIdentity)
	return identity
}

func withIdentity(ctx context.Context, identity *ConnectorIdentity) context.Context {
	if identity == nil {
		return ctx
	}
	return context.WithValue(ctx, identityContextKey{}, identity)
}

type identityServerStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (s *identityServerStream) Context() context.Context {
	return s.ctx
}

func (m *Middlewares) GrpcAuth(ctx context.Context, req any, _ *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
	identity, err := m.authFromContext(ctx)
	if err != nil {
		return nil, err
	}
	if wait, ok := m.AuthService.limiter.Allow(identity, nowUTC()); identity != nil && !ok {
		_ = grpc.SetHeader(ctx, metadata.Pairs("retry-after", retryAfterSeconds(wait)))
		return nil, status.Error(codes.ResourceExhausted, "rate limit exceeded; retry-after=1")
	}
	return handler(withIdentity(ctx, identity), req)
}

func (m *Middlewares) GrpcStreamAuth(srv any, ss grpc.ServerStream, _ *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
	identity, err := m.authFromContext(ss.Context())
	if err != nil {
		return err
	}
	if identity != nil {
		if err := m.AuthService.limiter.AcquireStream(identity); err != nil {
			_ = grpc.SetHeader(ss.Context(), metadata.Pairs("retry-after", "1"))
			return err
		}
		defer m.AuthService.limiter.ReleaseStream(identity)
	}
	return handler(srv, &identityServerStream{ServerStream: ss, ctx: withIdentity(ss.Context(), identity)})
}

func (m *Middlewares) LimitBody() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxMessageBytes)
		c.Next()
	}
}

func (m *Middlewares) HttpAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		identity, err := m.authenticateHTTP(c)
		if err != nil {
			writeIngressError(c, err)
			return
		}
		if wait, ok := m.AuthService.limiter.Allow(identity, nowUTC()); !ok {
			c.Header("Retry-After", retryAfterSeconds(wait))
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			c.Abort()
			return
		}
		c.Request = c.Request.WithContext(withIdentity(c.Request.Context(), identity))
		c.Next()
	}
}

func (m *Middlewares) GitHubAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			writeMaxBytesOrError(c, err, "failed to read request body")
			return
		}
		sig := c.GetHeader("X-Hub-Signature-256")
		if len(sig) == 0 {
			e := catcher.Error("missing X-Hub-Signature-256 header", nil, map[string]any{"process": "plugin_com.hivearmor.inputs", "status": http.StatusUnauthorized})
			e.GinError(c)
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewBuffer(body))
		key := m.AuthService.GetConnectionKey()
		err = verifySignature(body, key, sig)
		if err != nil {
			e := catcher.Error("failed to verify signature", err, map[string]any{"process": "plugin_com.hivearmor.inputs", "status": http.StatusUnauthorized})
			e.GinError(c)
			return
		}
		e := catcher.Error("connector identity required", errMissingIdentity, map[string]any{"process": "plugin_com.hivearmor.inputs", "status": http.StatusForbidden})
		e.GinError(c)
	}
}

func (m *Middlewares) authenticateHTTP(c *gin.Context) (*ConnectorIdentity, error) {
	idHeader := firstNonEmpty(c.GetHeader("id"), c.GetHeader("X-HiveArmor-Connector-Id"))
	keyHeader := firstNonEmpty(c.GetHeader("key"), c.GetHeader("X-HiveArmor-Connector-Key"))
	typeHeader := firstNonEmpty(c.GetHeader("type"), c.GetHeader("X-HiveArmor-Connector-Type"))
	if idHeader != "" && keyHeader != "" && typeHeader != "" {
		id, err := strconv.ParseUint(idHeader, 10, 32)
		if err != nil {
			return nil, status.Error(codes.PermissionDenied, "id is not valid")
		}
		return m.AuthService.AuthenticateConnector(uint(id), typeHeader, keyHeader)
	}
	connectionKey := c.GetHeader(proxyAPIKeyHeader)
	if connectionKey != "" && m.AuthService.IsConnectionKeyValid(connectionKey) {
		return nil, status.Error(codes.PermissionDenied, errMissingIdentity.Error())
	}
	return nil, status.Error(codes.Unauthenticated, "auth is not provided")
}

func (m *Middlewares) authFromContext(ctx context.Context) (*ConnectorIdentity, error) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil, status.Error(codes.Internal, "metadata is not provided")
	}

	authKey := md.Get("key")
	authId := md.Get("id")
	connectorType := md.Get("type")
	authConnectionKey := md.Get("connection-key")
	authInternalKey := md.Get("internal-key")

	if len(authKey) > 0 && len(authId) > 0 && len(connectorType) > 0 {
		id, err := strconv.ParseUint(authId[0], 10, 32)
		if err != nil {
			return nil, status.Error(codes.PermissionDenied, "id is not valid")
		}
		return m.AuthService.AuthenticateConnector(uint(id), connectorType[0], authKey[0])
	}
	if len(authConnectionKey) > 0 {
		if !isConnectionKeyValid(authConnectionKey[0]) {
			return nil, status.Error(codes.PermissionDenied, "invalid connection key")
		}
		return nil, nil
	}
	if len(authInternalKey) > 0 {
		internalKey := hiveArmorInternalKey()
		if subtle.ConstantTimeCompare([]byte(internalKey), []byte(authInternalKey[0])) != 1 {
			return nil, status.Error(codes.PermissionDenied, "internal key does not match")
		}
		return nil, nil
	}
	return nil, status.Error(codes.Unauthenticated, "auth is not provided")
}

func verifySignature(payloadBody []byte, secretToken string, signatureHeader string) error {
	if signatureHeader == "" {
		return errors.New("x-hub-signature-256 header is missing")
	}

	mac := hmac.New(sha256.New, []byte(secretToken))
	mac.Write(payloadBody)
	expectedSignature := "sha256=" + fmt.Sprintf("%x", mac.Sum(nil))

	if signatureHeader != expectedSignature {
		return errors.New("request signatures didn't match")
	}

	return nil
}

func isConnectionKeyValid(token string) bool {
	panelKey, e := GetConnectionKey()
	if e != nil {
		return false
	}

	return token == string(panelKey)
}

func writeIngressError(c *gin.Context, err error) {
	httpStatus := http.StatusUnauthorized
	if status.Code(err) == codes.PermissionDenied {
		httpStatus = http.StatusForbidden
	}
	if status.Code(err) == codes.ResourceExhausted {
		httpStatus = http.StatusTooManyRequests
		c.Header("Retry-After", "1")
	}
	e := catcher.Error("cannot authenticate", err, map[string]any{"process": "plugin_com.hivearmor.inputs", "status": httpStatus})
	e.GinError(c)
}

func writeMaxBytesOrError(c *gin.Context, err error, message string) {
	var maxBytesError *http.MaxBytesError
	if errors.As(err, &maxBytesError) {
		c.Header("Retry-After", "1")
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "payload exceeds 4 MiB limit"})
		c.Abort()
		return
	}
	e := catcher.Error(message, err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
	e.GinError(c)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func retryAfterSeconds(wait time.Duration) string {
	if wait <= 0 {
		return "1"
	}
	seconds := int(wait.Seconds())
	if seconds < 1 {
		return "1"
	}
	return strconv.Itoa(seconds)
}

func nowUTC() time.Time {
	return time.Now().UTC()
}
