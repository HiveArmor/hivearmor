package handlers

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"time"

	"github.com/hivearmor/cm-server/store"
)

type publishVersionRequest struct {
	Component   string `json:"component"`
	Tag         string `json:"tag"`
	DownloadURL string `json:"download_url"`
	Signature   string `json:"signature"` // base64 RSA-PSS sig over (component+tag+download_url)
	Stable      *bool  `json:"stable"`
}

// PublishVersion registers a new release version (admin only, called by CI).
func (cfg *Config) PublishVersion(w http.ResponseWriter, r *http.Request) {
	var req publishVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.Component == "" || req.Tag == "" || req.DownloadURL == "" {
		jsonError(w, http.StatusBadRequest, "component, tag, and download_url are required")
		return
	}

	// Verify the RSA-PSS signature over the payload if a public key is configured.
	if cfg.SignPublicKey != "" {
		if err := verifySignature(cfg.SignPublicKey, req.Component+req.Tag+req.DownloadURL, req.Signature); err != nil {
			jsonError(w, http.StatusForbidden, "invalid payload signature: "+err.Error())
			return
		}
	}

	stable := true
	if req.Stable != nil {
		stable = *req.Stable
	}

	ver := store.Version{
		Component:   req.Component,
		Tag:         req.Tag,
		DownloadURL: req.DownloadURL,
		Signature:   req.Signature,
		Stable:      stable,
		PublishedAt: time.Now().UTC(),
	}

	// Upsert: update download URL and signature if this tag already exists.
	result := cfg.DB.Where(store.Version{Component: req.Component, Tag: req.Tag}).
		Assign(store.Version{DownloadURL: req.DownloadURL, Signature: req.Signature, Stable: stable, PublishedAt: ver.PublishedAt}).
		FirstOrCreate(&ver)

	if result.Error != nil {
		jsonError(w, http.StatusInternalServerError, "db error")
		return
	}

	jsonOK(w, http.StatusCreated, ver)
}

// ListVersions returns all published versions, optionally filtered by component.
func (cfg *Config) ListVersions(w http.ResponseWriter, r *http.Request) {
	q := cfg.DB.Order("published_at DESC")
	if c := r.URL.Query().Get("component"); c != "" {
		q = q.Where("component = ?", c)
	}

	var versions []store.Version
	if err := q.Find(&versions).Error; err != nil {
		jsonError(w, http.StatusInternalServerError, "db error")
		return
	}
	jsonOK(w, http.StatusOK, versions)
}

func verifySignature(publicKeyPEM, payload, sigB64 string) error {
	block, _ := pem.Decode([]byte(publicKeyPEM))
	if block == nil {
		return errorf("failed to decode PEM block")
	}
	pubKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return err
	}
	rsaKey, ok := pubKey.(*rsa.PublicKey)
	if !ok {
		return errorf("not an RSA public key")
	}

	sig, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil {
		return err
	}

	hash := sha256.Sum256([]byte(payload))
	return rsa.VerifyPSS(rsaKey, crypto.SHA256, hash[:], sig, nil)
}

type simpleError string

func (e simpleError) Error() string { return string(e) }
func errorf(s string) error         { return simpleError(s) }
