package http

import (
	"net/http"
	"os/exec"
	"strings"

	"github.com/gin-gonic/gin"
)

func registerHealthRoutes(r *gin.Engine) {
	r.GET("/health", handleHealth)
	r.GET("/api/healthcheck", handleHealth)
}

func handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "hivearmor-event-processor",
		"plugins": getSupervisordStatus(),
	})
}

// getSupervisordStatus runs supervisorctl and parses each line into a map.
// Returns nil if supervisorctl is unavailable (e.g. outside the container).
func getSupervisordStatus() []map[string]interface{} {
	out, err := exec.Command("supervisorctl", "-c", "/tmp/supervisord.conf", "status").Output()
	if err != nil {
		return nil
	}

	var statuses []map[string]interface{}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		entry := map[string]interface{}{
			"name":  parts[0],
			"state": parts[1],
		}
		// supervisorctl prints uptime as "uptime HH:MM:SS" after the pid field
		// e.g.: "engine   RUNNING   pid 42, uptime 0:12:34"
		if len(parts) >= 5 && parts[2] == "pid" {
			entry["uptime"] = parts[len(parts)-1]
		}
		statuses = append(statuses, entry)
	}
	return statuses
}
