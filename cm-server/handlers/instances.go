package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"

	"github.com/hivearmor/cm-server/middleware"
	"github.com/hivearmor/cm-server/store"
)

// InstanceDTOInput mirrors the installer's schemas.go InstanceDTOInput exactly.
type InstanceDTOInput struct {
	Name        string `json:"name"`
	Country     string `json:"country"`
	Email       string `json:"email"`
	Version     string `json:"version"`
	Edition     string `json:"edition"`
	CurrentIp   string `json:"current_ip"`
	MappingName string `json:"mapping_name,omitempty"`
	Tags        string `json:"tags"`
}

// Auth mirrors the installer's schemas.go Auth struct.
type Auth struct {
	ID  string `json:"id"`
	Key string `json:"key"`
}

// Register handles POST /api/v1/instances/register
// Body: InstanceDTOInput. Optional "signature" header: HMAC-SHA256(salt, name|edition|version).
// Returns: Auth{id, key} — persisted by installer to instance-config.yml.
func (cfg *Config) Register(w http.ResponseWriter, r *http.Request) {
	var body InstanceDTOInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if cfg.EncryptSalt != "" {
		sig := r.Header.Get("signature")
		expected := computeHMAC(cfg.EncryptSalt, fmt.Sprintf("%s|%s|%s", body.Name, body.Edition, body.Version))
		if !hmac.Equal([]byte(sig), []byte(expected)) {
			jsonError(w, http.StatusForbidden, "invalid registration signature")
			return
		}
	}

	id := uuid.NewString()
	key := uuid.NewString()

	inst := store.Instance{
		ID:          id,
		APIKey:      key,
		Name:        body.Name,
		Country:     body.Country,
		Email:       body.Email,
		Version:     body.Version,
		Edition:     body.Edition,
		CurrentIp:   body.CurrentIp,
		MappingName: body.MappingName,
		Tags:        body.Tags,
		LicenseType: "community",
		LastSeenAt:  time.Now().UTC(),
		CreatedAt:   time.Now().UTC(),
	}
	if err := cfg.DB.Create(&inst).Error; err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to register instance")
		return
	}

	jsonOK(w, http.StatusOK, Auth{ID: id, Key: key})
}

// Heartbeat handles POST /api/v1/instances/heartbeat
// Auth: id/key headers (InstanceAuth middleware). No body needed.
func (cfg *Config) Heartbeat(w http.ResponseWriter, r *http.Request) {
	inst := r.Context().Value(middleware.InstanceKey).(*store.Instance)
	cfg.DB.Model(inst).Update("last_seen_at", time.Now().UTC())
	w.WriteHeader(http.StatusOK)
}

// GetInstanceDetails handles GET /api/v1/instances
// Returns the full instance record for the authenticated instance.
func (cfg *Config) GetInstanceDetails(w http.ResponseWriter, r *http.Request) {
	inst := r.Context().Value(middleware.InstanceKey).(*store.Instance)
	jsonOK(w, http.StatusOK, inst)
}

// UpdateInstanceDetails handles PUT /api/v1/instances/details
// Allows installer to sync updated Name, Email, Country, IP, Version etc.
func (cfg *Config) UpdateInstanceDetails(w http.ResponseWriter, r *http.Request) {
	inst := r.Context().Value(middleware.InstanceKey).(*store.Instance)

	var body InstanceDTOInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	updates := map[string]interface{}{
		"name":         body.Name,
		"email":        body.Email,
		"country":      body.Country,
		"current_ip":   body.CurrentIp,
		"mapping_name": body.MappingName,
		"tags":         body.Tags,
		"version":      body.Version,
		"edition":      body.Edition,
	}
	cfg.DB.Model(inst).Updates(updates)
	w.WriteHeader(http.StatusOK)
}

// GetLicense handles GET /api/v1/licenses
// Returns license info for the authenticated instance.
// The installer calls this to enforce license-gated features.
type LicenseEncrypted struct {
	LicenseType string     `json:"license_type"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	Valid        bool       `json:"valid"`
}

func (cfg *Config) GetLicense(w http.ResponseWriter, r *http.Request) {
	inst := r.Context().Value(middleware.InstanceKey).(*store.Instance)

	valid := inst.ExpiresAt == nil || inst.ExpiresAt.After(time.Now().UTC())
	jsonOK(w, http.StatusOK, LicenseEncrypted{
		LicenseType: inst.LicenseType,
		ExpiresAt:   inst.ExpiresAt,
		Valid:        valid,
	})
}

// --- Admin endpoints ----------------------------------------------------------

// ListInstances handles GET /api/v1/admin/instances (admin auth).
func (cfg *Config) ListInstances(w http.ResponseWriter, r *http.Request) {
	var instances []store.Instance
	if err := cfg.DB.Order("created_at DESC").Find(&instances).Error; err != nil {
		jsonError(w, http.StatusInternalServerError, "db error")
		return
	}
	jsonOK(w, http.StatusOK, instances)
}

type setLicenseRequest struct {
	LicenseType string     `json:"license_type"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
}

// SetLicense handles PUT /api/v1/admin/instances/{instance_id}/license (admin auth).
func (cfg *Config) SetLicense(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["instance_id"]

	var req setLicenseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	result := cfg.DB.Model(&store.Instance{}).Where("id = ?", id).Updates(map[string]interface{}{
		"license_type": req.LicenseType,
		"expires_at":   req.ExpiresAt,
	})
	if result.Error != nil {
		jsonError(w, http.StatusInternalServerError, "db error")
		return
	}
	if result.RowsAffected == 0 {
		jsonError(w, http.StatusNotFound, "instance not found")
		return
	}

	jsonOK(w, http.StatusOK, map[string]string{"status": "updated"})
}

// --- Shared helpers -----------------------------------------------------------

func jsonOK(w http.ResponseWriter, code int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(body)
}

func jsonError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func computeHMAC(secret, data string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

