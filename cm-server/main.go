package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
	"github.com/hivearmor/cm-server/handlers"
	"github.com/hivearmor/cm-server/middleware"
	"github.com/hivearmor/cm-server/store"
)

func main() {
	db, err := store.Connect(mustEnv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	if err := store.Migrate(db); err != nil {
		log.Fatalf("db migrate: %v", err)
	}

	cfg := &handlers.Config{
		DB:            db,
		EncryptSalt:   os.Getenv("CM_ENCRYPT_SALT"),
		SignPublicKey: os.Getenv("CM_SIGN_PUBLIC_KEY"),
	}

	r := mux.NewRouter()

	// -------------------------------------------------------------------------
	// Public endpoints (no auth)
	// -------------------------------------------------------------------------
	r.HandleFunc("/api/v1/health", cfg.Health).Methods(http.MethodGet)

	// POST /api/v1/instances/register — installer calls on first boot
	r.HandleFunc("/api/v1/instances/register", cfg.Register).Methods(http.MethodPost)

	// -------------------------------------------------------------------------
	// Instance-authenticated subrouter
	// Auth: "id" and "key" HTTP headers matching installer's DoReq helper
	// -------------------------------------------------------------------------
	inst := r.PathPrefix("/api/v1").Subrouter()
	inst.Use(middleware.InstanceAuth(db))

	// GET  /api/v1/instances          — fetch own instance record
	inst.HandleFunc("/instances", cfg.GetInstanceDetails).Methods(http.MethodGet)

	// PUT  /api/v1/instances/details  — update name, email, IP, version
	inst.HandleFunc("/instances/details", cfg.UpdateInstanceDetails).Methods(http.MethodPut)

	// POST /api/v1/instances/heartbeat — ping to update last_seen_at
	inst.HandleFunc("/instances/heartbeat", cfg.Heartbeat).Methods(http.MethodPost)

	// GET  /api/v1/updates            — poll for pending updates (returns []UpdateDTO)
	inst.HandleFunc("/updates", cfg.GetUpdates).Methods(http.MethodGet)

	// POST /api/v1/updates/sent?id=<updateId> — confirm update applied
	inst.HandleFunc("/updates/sent", cfg.SetUpdateSent).Methods(http.MethodPost)

	// GET  /api/v1/licenses           — get license status for this instance
	inst.HandleFunc("/licenses", cfg.GetLicense).Methods(http.MethodGet)

	// POST /api/v1/logcollectors/upload — multipart log file upload
	inst.HandleFunc("/logcollectors/upload", cfg.UploadLogCollector).Methods(http.MethodPost)

	// -------------------------------------------------------------------------
	// Admin-authenticated subrouter
	// Auth: "Authorization: Bearer <id>:<key>" header
	// Used by CI pipeline and ops tooling.
	// -------------------------------------------------------------------------
	admin := r.PathPrefix("/api/v1/admin").Subrouter()
	admin.Use(middleware.AdminAuth(db))

	// Version management (CI publishes new releases here)
	admin.HandleFunc("/versions", cfg.PublishVersion).Methods(http.MethodPost)
	admin.HandleFunc("/versions", cfg.ListVersions).Methods(http.MethodGet)

	// Instance management
	admin.HandleFunc("/instances", cfg.ListInstances).Methods(http.MethodGet)
	admin.HandleFunc("/instances/{instance_id}/license", cfg.SetLicense).Methods(http.MethodPut)

	// Push a software update to one or all instances
	admin.HandleFunc("/updates", cfg.PushUpdate).Methods(http.MethodPost)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("cm-server listening on :%s", port)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required env var %s is not set", key)
	}
	return v
}
