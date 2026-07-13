package config

import (
	"path/filepath"

	"github.com/hivearmor/as400/updater/utils"
)

const (
	SERV_LOG            = "hivearmor_as400_updater.log"
	SERV_COLLECTOR_NAME = "HiveArmorAS400Collector"
	JAR_FILE            = "as400-collector.jar"
)

var (
	DependUrl        = "https://%s:%s/private/dependencies/collector/as400/%s"
	AgentManagerPort = "9000"
	LogAuthProxyPort = "50051"
	DependenciesPort = "9001"

	ServiceFile = "hivearmor_as400_collector%s"
	VersionPath = filepath.Join(utils.GetMyPath(), "version.json")
)
