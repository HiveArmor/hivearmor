package config

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/threatwinds/go-sdk/catcher"
)

// moduleGroupConf mirrors the backend UtmModuleGroupConfiguration DTO.
type moduleGroupConf struct {
	ConfKey      string `json:"confKey"`
	ConfValue    string `json:"confValue"`
	ConfDataType string `json:"confDataType"`
}

// moduleGroup mirrors the backend UtmModuleGroup DTO.
type moduleGroup struct {
	ModuleGroupConfigurations []moduleGroupConf `json:"moduleGroupConfigurations"`
}

// moduleDetails mirrors the backend UtmModule DTO.
type moduleDetails struct {
	ModuleActive bool          `json:"moduleActive"`
	ModuleGroups []moduleGroup `json:"moduleGroups"`
}

// ReloadFromBackend fetches hivearmor.socai.* config keys from the backend and
// applies them to the in-memory config. Only runs meaningfully in standalone mode.
// Skips masked ("***") customHeaders values so a live api-key is never clobbered.
func ReloadFromBackend() error {
	cfg := GetConfig()
	if cfg.Backend == "" || cfg.InternalKey == "" {
		return fmt.Errorf("backend or internal key not set — cannot reload")
	}

	url := cfg.Backend + "/api/ha-modules/module-details-decrypted?nameShort=SOC_AI"
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Utm-Internal-Key", cfg.InternalKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("backend returned %d: %s", resp.StatusCode, string(body))
	}

	var details moduleDetails
	if err := json.Unmarshal(body, &details); err != nil {
		return fmt.Errorf("parse response: %w", err)
	}

	if len(details.ModuleGroups) == 0 {
		return fmt.Errorf("no config groups returned — module may not be provisioned yet")
	}

	confs := details.ModuleGroups[0].ModuleGroupConfigurations
	applyConfsToConfig(confs, details.ModuleActive)
	return nil
}

// applyConfsToConfig updates the in-memory config from a slice of key-value rows.
func applyConfsToConfig(confs []moduleGroupConf, moduleActive bool) {
	configMutex.Lock()
	defer configMutex.Unlock()

	config.ModuleActive = moduleActive

	for _, c := range confs {
		switch c.ConfKey {
		case "hivearmor.socai.autoAnalyze":
			config.AutoAnalyze = c.ConfValue == "true"
		case "hivearmor.socai.incidentCreation":
			config.AutomaticIncidentCreation = c.ConfValue == "true"
		case "hivearmor.socai.changeAlertStatus":
			config.ChangeAlertStatus = c.ConfValue == "true"
		case "hivearmor.socai.provider":
			if c.ConfValue != "" {
				config.Provider = c.ConfValue
			}
		case "hivearmor.socai.url":
			if c.ConfValue != "" {
				config.URL = c.ConfValue
			}
		case "hivearmor.socai.model":
			if c.ConfValue != "" {
				config.Model = c.ConfValue
			}
		case "hivearmor.socai.authType":
			config.AuthType = c.ConfValue
		case "hivearmor.socai.maxTokens":
			if c.ConfValue != "" {
				if v, err := strconv.Atoi(c.ConfValue); err == nil {
					config.MaxTokens = v
				}
			}
		case "hivearmor.socai.customHeaders":
			// Skip masked values — never wipe a live api-key with "***"
			if c.ConfValue == "" || strings.HasPrefix(c.ConfValue, "***") || c.ConfValue == "{}" {
				continue
			}
			var headers map[string]string
			if err := json.Unmarshal([]byte(c.ConfValue), &headers); err == nil {
				config.CustomHeaders = headers
			}
		}
	}

	// Resolve URL from provider default when provider changed without an explicit URL
	if config.Provider != "" && config.Provider != "custom" && config.Provider != "ollama" {
		if defaultURL, ok := providerDefaultURLs[config.Provider]; ok && defaultURL != "" {
			// Only override if URL is empty or still pointing at a different provider's default
			currentIsDefault := false
			for _, u := range providerDefaultURLs {
				if config.URL == u {
					currentIsDefault = true
					break
				}
			}
			if config.URL == "" || currentIsDefault {
				config.URL = defaultURL
			}
		}
	}

	catcher.Info("SOC-AI config reloaded from backend", map[string]any{
		"process":  "plugin_com.hivearmor.soc-ai",
		"provider": config.Provider,
		"model":    config.Model,
		"url":      config.URL,
		"active":   config.ModuleActive,
	})
}

// StartBackendConfigPoll starts a goroutine that periodically reloads config from
// the backend. Used in standalone mode so UI saves take effect without a restart.
func StartBackendConfigPoll(intervalSeconds int) {
	if intervalSeconds <= 0 {
		intervalSeconds = 30
	}
	go func() {
		// Short initial delay so the plugin finishes startup first
		time.Sleep(5 * time.Second)
		for {
			if err := ReloadFromBackend(); err != nil {
				catcher.Error("config poll: reload failed", err, map[string]any{
					"process": "plugin_com.hivearmor.soc-ai",
				})
			}
			time.Sleep(time.Duration(intervalSeconds) * time.Second)
		}
	}()
}
