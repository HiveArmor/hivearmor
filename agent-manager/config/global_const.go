package config

import (
	"os"
	"path/filepath"
	"time"
)

func KeyAuthRoutes() []string {
	return []string{
		"/agent.AgentService/AgentStream",
		"/agent.AgentService/UpdateAgent",
		"/agent.AgentService/DeleteAgent",

		"/agent.CollectorService/CollectorStream",
		"/agent.CollectorService/DeleteCollector",
		"/agent.CollectorService/GetCollectorConfig",

		"/agent.ModuleConfigService/IsModuleEnabled",

		"/agent.PingService/Ping",

		"/grpc.health.v1.Health/Check",
	}
}

func ConnectionKeyRoutes() []string {
	return []string{
		"/agent.CollectorService/RegisterCollector",
	}
}

func EnrollmentTokenRoutes() []string {
	return []string{"/agent.AgentService/RegisterAgent"}
}

func InternalKeyRoutes() []string {
	return []string{
		"/agent.AgentService/ListAgents",
		"/agent.AgentService/ListAgentCommands",
		"/agent.AgentService/CreateEnrollmentToken",
		"/agent.AgentService/ListEnrollmentTokens",
		"/agent.AgentService/RevokeEnrollmentToken",
		"/agent.AgentService/RotateAgentCredential",
		"/agent.AgentService/RevokeAgentCredential",
		"/agent.AgentService/ListEnrollmentAuditEvents",
		"/agent.AgentService/VerifyConnectorIdentity",
		"/agent.AgentService/ListConnectorAuthorization",
		"/agent.AgentService/DeleteAgent",

		"/agent.CollectorService/ListCollector",

		"/agent.PanelService/ProcessCommand",
		"/agent.PanelCollectorService/RegisterCollectorConfig",

		"/grpc.health.v1.Health/Check",
	}
}

var (
	PanelConnectionKeyUrl     = "%s/api/authenticateFederationServiceManager"
	CheckEvery                = 5 * time.Minute
	CertPath                  = "/cert/ha.crt"
	CertKeyPath               = "/cert/ha.key"
	UpdatesFolder             = "/updates"
	UpdatesVersionsPath       = filepath.Join(UpdatesFolder, "version.json")
	UpdatesDependenciesFolder = "/dependencies"
	InternalKey               = os.Getenv("INTERNAL_KEY")
	PanelServiceName          = os.Getenv("PANEL_SERV_NAME")
	LogLevel                  = os.Getenv("LOG_LEVEL")
	EncryptionKey             = os.Getenv("ENCRYPTION_KEY")
	UTMHost                   = os.Getenv("HA_HOST")
	DBHost                    = os.Getenv("DB_HOST")
	DBPort                    = os.Getenv("DB_PORT")
	DBUser                    = os.Getenv("DB_USER")
	DBPassword                = os.Getenv("DB_PASSWORD")
	DBName                    = os.Getenv("DB_NAME")
	// P0-A2-7 §3.2b — optional dedicated credentials for the all-tenant, BYPASSRLS
	// system-context pool (boot caches, connector-authorization reconciliation,
	// VerifyConnectorIdentity). When unset, the system pool falls back to DB_USER /
	// DB_PASSWORD, so this change is inert until an operator provisions the roles.
	DBSystemUser              = os.Getenv("DB_SYSTEM_USER")
	DBSystemPassword          = os.Getenv("DB_SYSTEM_PASSWORD")
	AllowLegacyEnrollment     = os.Getenv("ALLOW_LEGACY_AGENT_ENROLLMENT") == "true"
)
