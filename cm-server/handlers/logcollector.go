package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const maxUploadSize = 256 << 20 // 256 MiB

// UploadLogCollector handles POST /api/v1/logcollectors/upload
// Auth: id/key headers (InstanceAuth middleware).
// Accepts a multipart form with field "file" and stores it for later processing.
func (cfg *Config) UploadLogCollector(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		jsonError(w, http.StatusBadRequest, "failed to parse multipart form")
		return
	}

	f, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer f.Close()

	uploadDir := os.Getenv("LOG_COLLECTOR_UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "/tmp/logcollector-uploads"
	}
	if err := os.MkdirAll(uploadDir, 0o750); err != nil {
		jsonError(w, http.StatusInternalServerError, "cannot create upload directory")
		return
	}

	filename := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(header.Filename))
	dest := filepath.Join(uploadDir, filename)

	out, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, f); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to write file")
		return
	}

	jsonOK(w, http.StatusOK, map[string]string{"status": "received", "filename": filename})
}
