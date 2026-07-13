package config

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	sync "sync"
	"time"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/threatwinds/go-sdk/plugins"
	"google.golang.org/grpc"
	codes "google.golang.org/grpc/codes"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const (
	reconnectDelay = 5 * time.Second
	maxMessageSize = 1024 * 1024 * 1024
)

var (
	config      Config
	configMutex sync.RWMutex
	configOnce  sync.Once
)

type Config struct {
	// System configuration
	Backend           string
	InternalKey       string
	OpensearchURL     string
	OpensearchUser    string
	OpensearchPassword string
	ModulesConfigHost string
	ModuleActive      bool

	// Analysis behavior
	AutoAnalyze               bool
	ChangeAlertStatus         bool
	AutomaticIncidentCreation bool

	// LLM Configuration (generic)
	Provider      string
	URL           string
	Model         string
	AuthType      string            // "custom-headers", "none"
	MaxTokens     int
	CustomHeaders map[string]string // All headers including auth (from frontend)
}

var providerDefaultURLs = map[string]string{
	"openai":    "https://api.openai.com/v1/chat/completions",
	"anthropic": "https://api.anthropic.com/v1/messages",
	"azure":     "",
	"gemini":    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
	"ollama":    "http://localhost:11434/v1/chat/completions",
	"mistral":   "https://api.mistral.ai/v1/chat/completions",
	"deepseek":  "https://api.deepseek.com/chat/completions",
	"groq":      "https://api.groq.com/openai/v1/chat/completions",
}

func GetConfig() *Config {
	configOnce.Do(func() {
		config = Config{}
	})
	return &config
}

// StartStandaloneConfig populates Config from environment variables, skipping gRPC.
// Required env vars:
//   SOC_AI_PROVIDER   — openai | anthropic | azure | gemini | ollama | mistral | deepseek | groq
//   SOC_AI_API_KEY    — API key (placed in Authorization: Bearer <key> or x-api-key for Anthropic)
//   SOC_AI_MODEL      — model name, e.g. gpt-4o or claude-3-5-sonnet-20241022
//   SOC_AI_BACKEND_URL — Spring Boot backend, e.g. http://localhost:8088
//   SOC_AI_INTERNAL_KEY — internal auth key shared with Spring Boot
// Optional:
//   SOC_AI_URL        — override the provider default URL
//   SOC_AI_MAX_TOKENS — default 4096
//   SOC_AI_OPENSEARCH_URL  — default https://localhost:9200
//   SOC_AI_OPENSEARCH_USER — default admin
//   SOC_AI_OPENSEARCH_PASS — default admin
func StartStandaloneConfig() {
	GetConfig()

	configMutex.Lock()
	defer configMutex.Unlock()

	provider := os.Getenv("SOC_AI_PROVIDER")
	apiKey := os.Getenv("SOC_AI_API_KEY")
	model := os.Getenv("SOC_AI_MODEL")
	backendURL := os.Getenv("SOC_AI_BACKEND_URL")
	internalKey := os.Getenv("SOC_AI_INTERNAL_KEY")

	if provider == "" || apiKey == "" || model == "" {
		fmt.Println("SOC-AI standalone mode: SOC_AI_PROVIDER, SOC_AI_API_KEY, SOC_AI_MODEL are required")
		fmt.Println("  SOC_AI_PROVIDER=openai|anthropic|gemini|ollama|mistral|deepseek|groq")
		fmt.Println("  SOC_AI_API_KEY=<your api key>")
		fmt.Println("  SOC_AI_MODEL=<model name>")
		fmt.Println("  SOC_AI_BACKEND_URL=http://localhost:8088")
		fmt.Println("  SOC_AI_INTERNAL_KEY=<shared internal key>")
		os.Exit(1)
	}

	config.Provider = provider
	config.Model = model
	config.ModuleActive = true
	config.AutoAnalyze = false // HTTP-only in standalone
	config.ChangeAlertStatus = false
	config.AutomaticIncidentCreation = false

	// Resolve URL: env override > provider default
	customURL := os.Getenv("SOC_AI_URL")
	if customURL != "" {
		config.URL = customURL
	} else if defaultURL, ok := providerDefaultURLs[provider]; ok && defaultURL != "" {
		config.URL = defaultURL
	}

	// Build auth headers for the provider
	config.AuthType = "custom-headers"
	config.CustomHeaders = map[string]string{}
	if provider == "anthropic" {
		// x-api-key is the auth header; anthropic-version is added by buildHeaders automatically
		config.CustomHeaders["x-api-key"] = apiKey
	} else {
		config.CustomHeaders["Authorization"] = "Bearer " + apiKey
	}

	// Max tokens
	if mt := os.Getenv("SOC_AI_MAX_TOKENS"); mt != "" {
		if v, err := strconv.Atoi(mt); err == nil {
			config.MaxTokens = v
		}
	}
	if config.MaxTokens == 0 {
		config.MaxTokens = 4096
	}

	// Backend connectivity
	if backendURL != "" {
		config.Backend = backendURL
	} else {
		config.Backend = "http://localhost:8088"
	}
	if internalKey != "" {
		config.InternalKey = internalKey
	} else {
		config.InternalKey = "standalone-dev-key"
	}

	// OpenSearch (optional for standalone — can be empty, processor will skip OpenSearch)
	osURL := os.Getenv("SOC_AI_OPENSEARCH_URL")
	if osURL == "" {
		osURL = "https://localhost:9200"
	}
	config.OpensearchURL = osURL
	config.OpensearchUser = os.Getenv("SOC_AI_OPENSEARCH_USER")
	if config.OpensearchUser == "" {
		config.OpensearchUser = "admin"
	}
	config.OpensearchPassword = os.Getenv("SOC_AI_OPENSEARCH_PASS")
	if config.OpensearchPassword == "" {
		config.OpensearchPassword = "admin"
	}

	fmt.Printf("SOC-AI standalone configured: provider=%s model=%s url=%s backend=%s\n",
		provider, model, config.URL, config.Backend)
}

func StartConfigurationSystem() {
	GetConfig()

	for {
		pluginConfig := plugins.PluginCfg("com.hivearmor")
		if !pluginConfig.Exists() {
			_ = catcher.Error("plugin configuration not found", nil, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
			time.Sleep(reconnectDelay)
			continue
		}

		osCfg := plugins.PluginCfg("org.opensearch").Get("opensearch")

		configMutex.Lock()
		config.Backend = pluginConfig.Get("backend").String()
		config.InternalKey = pluginConfig.Get("internalKey").String()
		config.OpensearchURL = "https://" + osCfg.Get("host").String() + ":" + osCfg.Get("port").String()
		config.OpensearchUser = osCfg.Get("user").String()
		config.OpensearchPassword = osCfg.Get("password").String()
		config.ModulesConfigHost = pluginConfig.Get("modulesConfig").String()
		configMutex.Unlock()

		if config.Backend == "" || config.InternalKey == "" || config.OpensearchURL == "" || config.ModulesConfigHost == "" {
			fmt.Println("Backend, Internal key, Opensearch or Modules Config Host is not set, skipping HiveArmor plugin execution")
			time.Sleep(reconnectDelay)
			continue
		}
		break
	}

	for {
		connCtx, connCancel := context.WithCancel(context.Background())
		connCtx = metadata.AppendToOutgoingContext(connCtx, "internal-key", config.InternalKey)
		conn, err := grpc.NewClient(
			config.ModulesConfigHost,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
			grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(maxMessageSize)),
		)

		if err != nil {
			catcher.Error("Failed to connect to server", err, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
			connCancel()
			time.Sleep(reconnectDelay)
			continue
		}

		state := conn.GetState()
		if state == connectivity.Shutdown || state == connectivity.TransientFailure {
			catcher.Error("Connection is in shutdown or transient failure state", nil, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
			conn.Close()
			connCancel()
			time.Sleep(reconnectDelay)
			continue
		}

		client := NewConfigServiceClient(conn)
		stream, err := client.StreamConfig(connCtx)
		if err != nil {
			catcher.Error("Failed to create stream", err, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
			conn.Close()
			connCancel()
			time.Sleep(reconnectDelay)
			continue
		}

		err = stream.Send(&BiDirectionalMessage{
			Payload: &BiDirectionalMessage_PluginInit{
				PluginInit: &PluginInit{Type: PluginType_SOC_AI},
			},
		})
		if err != nil {
			catcher.Error("Failed to send PluginInit", err, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
			conn.Close()
			connCancel()
			time.Sleep(reconnectDelay)
			continue
		}

		for {
			in, err := stream.Recv()
			if err != nil {
				if strings.Contains(err.Error(), "EOF") {
					catcher.Info("Stream closed by server, reconnecting...", map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
					conn.Close()
					connCancel()
					time.Sleep(reconnectDelay)
					break
				}
				st, ok := status.FromError(err)
				if ok && (st.Code() == codes.Unavailable || st.Code() == codes.Canceled) {
					catcher.Error("Stream error: "+st.Message(), err, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
					conn.Close()
					connCancel()
					time.Sleep(reconnectDelay)
					break
				} else {
					catcher.Error("Stream receive error", err, map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
					time.Sleep(reconnectDelay)
					continue
				}
			}

			switch message := in.Payload.(type) {
			case *BiDirectionalMessage_Config:
				catcher.Info("Received configuration update", map[string]any{"process": "plugin_com.hivearmor.soc-ai"})
				updateConfigFromGRPC(message.Config)
			}
		}

		conn.Close()
		connCancel()
		time.Sleep(reconnectDelay)
	}
}

func updateConfigFromGRPC(grpcConf *ConfigurationSection) {
	configMutex.Lock()
	defer configMutex.Unlock()

	if grpcConf == nil {
		return
	}

	config.ModuleActive = grpcConf.ModuleActive

	if len(grpcConf.ModuleGroups) == 0 {
		return
	}

	// Reset custom headers
	config.CustomHeaders = make(map[string]string)

	for _, c := range grpcConf.ModuleGroups[0].ModuleGroupConfigurations {
		switch c.ConfKey {
		// Behavior settings
		case "hivearmor.socai.autoAnalyze":
			config.AutoAnalyze = c.ConfValue == "true"
		case "hivearmor.socai.incidentCreation":
			config.AutomaticIncidentCreation = c.ConfValue == "true"
		case "hivearmor.socai.changeAlertStatus":
			config.ChangeAlertStatus = c.ConfValue == "true"

		// LLM settings
		case "hivearmor.socai.provider":
			config.Provider = c.ConfValue
		case "hivearmor.socai.url":
			config.URL = c.ConfValue
		case "hivearmor.socai.model":
			config.Model = c.ConfValue
		case "hivearmor.socai.authType":
			config.AuthType = c.ConfValue
		case "hivearmor.socai.maxTokens":
			if c.ConfValue != "" {
				if v, err := strconv.Atoi(c.ConfValue); err == nil {
					config.MaxTokens = v
				}
			}
		case "hivearmor.socai.customHeaders":
			if c.ConfValue != "" {
				if err := json.Unmarshal([]byte(c.ConfValue), &config.CustomHeaders); err != nil {
					catcher.Error("Failed to parse customHeaders JSON", err, map[string]any{
						"process": "plugin_com.hivearmor.soc-ai",
						"value":   c.ConfValue,
					})
				}
			}
		}
	}

	// Resolve URL from provider if not explicitly set or if using a known provider
	if config.Provider != "" && config.Provider != "custom" {
		if defaultURL, ok := providerDefaultURLs[config.Provider]; ok && defaultURL != "" {
			config.URL = defaultURL
		}
	}
}
