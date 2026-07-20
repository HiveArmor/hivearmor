package http

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func publicPort() string {
	if p := os.Getenv("PUBLIC_PORT"); p != "" {
		return ":" + p
	}
	return ":8000"
}

func ingestPort() string {
	if p := os.Getenv("INGEST_PORT"); p != "" {
		return ":" + p
	}
	return ":8090"
}

// StartPublicServer starts the backend-facing API (default :8000, override PUBLIC_PORT).
func StartPublicServer() {
	r := publicRouter()
	srv := &http.Server{Addr: publicPort(), Handler: r}
	go srv.ListenAndServe()
}

// StartIngestServer starts the test injection endpoint (default :8090, override INGEST_PORT).
func StartIngestServer() {
	r := ingestRouter()
	srv := &http.Server{Addr: ingestPort(), Handler: r}
	go srv.ListenAndServe()
}

func publicRouter() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	registerHealthRoutes(r)
	registerModulesRoutes(r)
	registerReloadRoutes(r)
	registerRulesRoutes(r)
	return r
}

func ingestRouter() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	registerIngestRoutes(r)
	registerHealthRoutes(r)
	return r
}
