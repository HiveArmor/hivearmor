package agent

import (
	context "context"
	"fmt"
	"strconv"
	"time"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/models"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/shared/fs"
	"google.golang.org/grpc/metadata"
)

const updateInterval = 5 * time.Minute

func UpdateAgent(cnf *config.Config, ctx context.Context) {
	var errLogged bool

	for {
		err := updateAgentOnce(cnf, ctx)
		if err != nil {
			if !errLogged {
				utils.Logger.ErrorF("error updating agent: %v", err)
				errLogged = true
			}
		} else {
			errLogged = false
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(updateInterval):
		}
	}
}

func updateAgentOnce(cnf *config.Config, ctx context.Context) error {
	connection, err := GetAgentManagerConnection(cnf)
	if err != nil {
		return err
	}

	client := NewAgentServiceClient(connection)

	osInfo, err := utils.GetOsInfo()
	if err != nil {
		return err
	}

	version := models.Version{}
	if err = fs.ReadJSON(config.VersionPath, &version); err != nil {
		return err
	}

	request := &AgentRequest{
		Hostname:       osInfo.Hostname,
		Version:        version.Version,
		Mac:            osInfo.Mac,
		OsMajorVersion: osInfo.OsMajorVersion,
		OsMinorVersion: osInfo.OsMinorVersion,
		Aliases:        osInfo.Aliases,
		Addresses:      osInfo.Addresses,
	}

	_, err = client.UpdateAgent(ctx, request)
	return err
}

// ValidateCredential proves that a newly issued credential is authoritative
// for this agent before the local protected configuration is replaced. The
// server's UpdateAgent response intentionally never echoes the credential.
func ValidateCredential(cnf *config.Config, credential string) error {
	if cnf == nil || cnf.AgentID == 0 || credential == "" {
		return fmt.Errorf("agent identity and credential are required")
	}
	connection, err := GetAgentManagerConnection(cnf)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	ctx = metadata.AppendToOutgoingContext(ctx,
		"key", credential,
		"id", strconv.FormatUint(uint64(cnf.AgentID), 10),
		"type", "agent",
	)
	if _, err := NewAgentServiceClient(connection).UpdateAgent(ctx, &AgentRequest{}); err != nil {
		return fmt.Errorf("credential validation failed: %w", err)
	}
	return nil
}
