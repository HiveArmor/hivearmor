package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/hivearmor/cm-server/middleware"
	"github.com/hivearmor/cm-server/store"
)

// VersionDTO mirrors the installer's schemas.go VersionDTO.
type VersionDTO struct {
	Version   string `json:"version"`
	Changelog string `json:"changelog"`
}

// UpdateDTO mirrors the installer's schemas.go UpdateDTO exactly.
// Note: "aprove_at" is an intentional typo preserved from the installer schema.
type UpdateDTO struct {
	ID          string           `json:"id"`
	Instance    InstanceDTOInput `json:"instance,omitempty"`
	Version     VersionDTO       `json:"version"`
	Edition     string           `json:"edition"`
	Sent        bool             `json:"sent"`
	Approved    bool             `json:"approved"`
	ApproveAt   time.Time        `json:"aprove_at,omitempty"`
	UpdateLocks string           `json:"update_locks,omitempty"`
}

// GetUpdates handles GET /api/v1/updates
// Returns pending (unsent, approved) updates for the authenticated instance as []UpdateDTO.
// The installer reads resp[0] as the next update to apply.
func (cfg *Config) GetUpdates(w http.ResponseWriter, r *http.Request) {
	inst := r.Context().Value(middleware.InstanceKey).(*store.Instance)

	var updates []store.Update
	cfg.DB.Where("instance_id = ? AND sent = false AND approved = true", inst.ID).
		Order("created_at ASC").
		Find(&updates)

	dtos := make([]UpdateDTO, 0, len(updates))
	for _, u := range updates {
		dtos = append(dtos, UpdateDTO{
			ID: u.ID,
			Instance: InstanceDTOInput{
				Name:        inst.Name,
				Country:     inst.Country,
				Email:       inst.Email,
				Version:     inst.Version,
				Edition:     inst.Edition,
				CurrentIp:   inst.CurrentIp,
				MappingName: inst.MappingName,
				Tags:        inst.Tags,
			},
			Version: VersionDTO{
				Version:   u.VersionTag,
				Changelog: u.Changelog,
			},
			Edition:     inst.Edition,
			Sent:        u.Sent,
			Approved:    u.Approved,
			ApproveAt:   u.ApproveAt,
			UpdateLocks: u.UpdateLocks,
		})
	}

	jsonOK(w, http.StatusOK, dtos)
}

// SetUpdateSent handles POST /api/v1/updates/sent?id=<updateId>
// Called by the installer after successfully applying an update.
func (cfg *Config) SetUpdateSent(w http.ResponseWriter, r *http.Request) {
	inst := r.Context().Value(middleware.InstanceKey).(*store.Instance)

	updateID := r.URL.Query().Get("id")
	if updateID == "" {
		jsonError(w, http.StatusBadRequest, "missing id query parameter")
		return
	}

	result := cfg.DB.Model(&store.Update{}).
		Where("id = ? AND instance_id = ?", updateID, inst.ID).
		Update("sent", true)
	if result.Error != nil {
		jsonError(w, http.StatusInternalServerError, "db error")
		return
	}
	if result.RowsAffected == 0 {
		jsonError(w, http.StatusNotFound, "update not found")
		return
	}

	w.WriteHeader(http.StatusOK)
}

// --- Admin endpoints ----------------------------------------------------------

type PushUpdateInput struct {
	// Empty InstanceIDs means push to all instances.
	InstanceIDs []string `json:"instance_ids"`
	VersionTag  string   `json:"version_tag"`
	Changelog   string   `json:"changelog"`
	UpdateLocks string   `json:"update_locks,omitempty"`
}

// PushUpdate handles POST /api/v1/admin/updates (admin auth)
// Creates Update rows so targeted instances pick them up on next poll.
func (cfg *Config) PushUpdate(w http.ResponseWriter, r *http.Request) {
	var body PushUpdateInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.VersionTag == "" {
		jsonError(w, http.StatusBadRequest, "version_tag is required")
		return
	}

	var targets []store.Instance
	if len(body.InstanceIDs) > 0 {
		cfg.DB.Where("id IN ?", body.InstanceIDs).Find(&targets)
	} else {
		cfg.DB.Find(&targets)
	}

	now := time.Now().UTC()
	queued := 0
	for _, inst := range targets {
		u := store.Update{
			ID:          uuid.NewString(),
			InstanceID:  inst.ID,
			VersionTag:  body.VersionTag,
			Changelog:   body.Changelog,
			UpdateLocks: body.UpdateLocks,
			Approved:    true,
			ApproveAt:   now,
			Sent:        false,
			CreatedAt:   now,
		}
		if err := cfg.DB.Create(&u).Error; err == nil {
			queued++
		}
	}

	jsonOK(w, http.StatusOK, map[string]int{"queued": queued})
}

// Ensure gorm is used (ErrRecordNotFound kept for potential future use in this file).
var _ = gorm.ErrRecordNotFound
