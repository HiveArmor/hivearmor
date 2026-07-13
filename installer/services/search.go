package services

import (
	"fmt"
	"time"

	"github.com/hivearmor/installer/config"
	"github.com/hivearmor/installer/utils"
)

func getOpenSearchContainerID() (string, error) {
	containerIDs, err := utils.RunCmdWithOutput("docker", "ps", "-q", "-f", "name=hivearmor_node1")
	if err != nil {
		return "", fmt.Errorf("error getting opensearch container: %v", err)
	}
	if len(containerIDs) == 0 {
		return "", fmt.Errorf("opensearch container not found")
	}
	return containerIDs[0], nil
}

func execCurl(containerID string, method, url, data string) error {
	cnf := config.GetConfig()
	args := []string{"exec", containerID, "curl", "-s", "-k", "-u", "admin:" + cnf.OpenSearchPassword, "-X", method}
	if data != "" {
		args = append(args, "-H", "Content-Type: application/json", "-d", data)
	}
	args = append(args, url)

	_, err := utils.RunCmdWithOutput("docker", args...)
	return err
}

func InitOpenSearch() error {
	containerID, err := getOpenSearchContainerID()
	if err != nil {
		return err
	}

	// Wait for OpenSearch to be ready
	for intent := 0; intent <= 10; intent++ {
		time.Sleep(1 * time.Minute)

		err := execCurl(containerID, "GET", "https://localhost:9200/_cluster/health?wait_for_status=green&timeout=50s", "")
		if err != nil {
			if intent >= 10 {
				return err
			}
		} else {
			break
		}
	}

	// Create snapshot repository
	snapshotData := `{"type":"fs","settings":{"location":"/usr/share/opensearch/.ha_geoip/","compress":true}}`
	if err := execCurl(containerID, "PUT", "https://localhost:9200/_snapshot/.ha_geoip", snapshotData); err != nil {
		return err
	}

	// Create index template
	templateData := `{"index_patterns":["_v3_hive_alert-","_v3_hive_log-",".ha-",".hivearmor-"],"template":{"settings":{"index.number_of_shards":1,"index.number_of_replicas":0,"index.mapping.total_fields.limit":50000}}}`
	if err := execCurl(containerID, "PUT", "https://localhost:9200/_index_template/hivearmor_indexes", templateData); err != nil {
		return err
	}

	// Restore geoip snapshot
	restoreData := `{"indices":".ha-geoip","include_global_state":false}`
	if err := execCurl(containerID, "POST", "https://localhost:9200/_snapshot/.ha_geoip/.ha_geoip/_restore", restoreData); err != nil {
		return err
	}

	return nil
}
