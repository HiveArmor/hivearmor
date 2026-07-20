package api

import (
	"encoding/json"
	"net/http"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/hivearmor/plugins/soc-ai/config"
	"github.com/hivearmor/plugins/soc-ai/internal/llm"
)

func handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(AnalyzeResponse{Status: "error", Message: "Method not allowed. Use POST."})
		return
	}

	if config.GetConfig() == nil || !config.GetConfig().ModuleActive {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(AnalyzeResponse{Status: "error", Message: "SOC-AI module is not active"})
		return
	}

	var req llm.ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(AnalyzeResponse{Status: "error", Message: "Invalid JSON: " + err.Error()})
		return
	}
	if len(req.Messages) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(AnalyzeResponse{Status: "error", Message: "messages array is required"})
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	if err := llm.StreamChat(&req, w); err != nil {
		catcher.Error("chat stream failed", err, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
		// Write an error delta so the client sees it
		b, _ := json.Marshal(llm.ChatDelta{Error: err.Error(), Done: true})
		w.Write([]byte("data: " + string(b) + "\n\n"))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}
}
