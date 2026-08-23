package agent

import (
	"context"

	"github.com/hivearmor/as400/config"
	"github.com/hivearmor/as400/conn"
	"github.com/hivearmor/as400/models"
	"github.com/hivearmor/as400/utils"
	"google.golang.org/grpc/metadata"
)

func RegisterCollector(cnf *config.Config, UTMKey string) error {
	if err := cnf.RequireTenant(); err != nil {
		return utils.Logger.ErrorF("collector tenant binding required (set HA_TENANT_ID or install arg): %v", err)
	}

	connection, err := conn.GetAgentManagerConnection(cnf)
	if err != nil {
		return utils.Logger.ErrorF("error connecting to Agent Manager: %v", err)
	}

	collectorClient := NewCollectorServiceClient(connection)
	ctx, cancel := context.WithCancel(context.Background())
	ctx = metadata.AppendToOutgoingContext(ctx, "connection-key", UTMKey)
	defer cancel()

	ip, err := utils.GetIPAddress()
	if err != nil {
		return utils.Logger.ErrorF("error getting ip address: %v", err)
	}

	osInfo, err := utils.GetOsInfo()
	if err != nil {
		return utils.Logger.ErrorF("error getting os info: %v", err)
	}

	version := models.Version{}
	err = utils.ReadJson(config.VersionPath, &version)
	if err != nil {
		return utils.Logger.ErrorF("error reading version file: %v", err)
	}

	request := &RegisterRequest{
		Ip:        ip,
		Hostname:  osInfo.Hostname,
		Version:   version.Version,
		Collector: CollectorModule_AS_400,
		TenantId:  cnf.TenantID,
	}

	utils.Logger.Info("Registering HiveArmor AS400 Collector with Agent Manager...")
	utils.Logger.Info("Collector Details: IP=%s, Hostname=%s, Version=%s, Module=%s, TenantID=%d",
		ip, osInfo.Hostname, version.Version, CollectorModule_AS_400.String(), cnf.TenantID)

	response, err := collectorClient.RegisterCollector(ctx, request)
	if err != nil {
		return utils.Logger.ErrorF("failed to register collector: %v", err)
	}

	if response.GetTenantId() <= 0 {
		return utils.Logger.ErrorF("registration response missing tenant binding")
	}

	cnf.CollectorID = uint(response.Id)
	cnf.CollectorKey = response.Key
	cnf.TenantID = response.GetTenantId()

	utils.Logger.Info("HiveArmor AS400 Collector registered successfully")
	utils.Logger.Info("Collector ID: %d TenantID: %d", cnf.CollectorID, cnf.TenantID)

	return nil
}
