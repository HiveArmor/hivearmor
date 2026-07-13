package agent

import (
	"context"
	"fmt"
	"os/user"
	"strconv"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
	"google.golang.org/grpc/metadata"
)

func DeleteAgent(cnf *config.Config) error {
	connection, err := GetAgentManagerConnection(cnf)
	if err != nil {
		return fmt.Errorf("error connecting to Agent Manager: %v", err)
	}

	agentClient := NewAgentServiceClient(connection)
	ctx, cancel := context.WithCancel(context.Background())
	ctx = metadata.AppendToOutgoingContext(ctx, "key", cnf.AgentKey)
	ctx = metadata.AppendToOutgoingContext(ctx, "id", strconv.Itoa(int(cnf.AgentID)))
	ctx = metadata.AppendToOutgoingContext(ctx, "type", "agent")
	defer cancel()

	currentUser, err := user.Current()
	if err != nil {
		return fmt.Errorf("error getting user: %v", err)
	}

	delReq := &DeleteRequest{
		DeletedBy: currentUser.Username,
	}

	_, err = agentClient.DeleteAgent(ctx, delReq)
	if err != nil {
		utils.Logger.ErrorF("error removing HiveArmor Agent from Agent Manager %v", err)
	}

	utils.Logger.LogF(100, "HiveArmor Agent removed successfully from agent manager")
	return nil
}
