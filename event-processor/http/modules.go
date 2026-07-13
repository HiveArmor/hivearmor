package http

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
)

var (
	modulesMu     sync.RWMutex
	modulesConfig = map[string]any{}
)

func registerModulesRoutes(r *gin.Engine) {
	r.POST("/api/v1/modules-config", handleModulesConfig)
	r.GET("/api/v1/modules-config", handleGetModulesConfig)
}

// handleModulesConfig accepts module configuration pushed by the Spring Boot backend.
func handleModulesConfig(c *gin.Context) {
	var body map[string]any
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	modulesMu.Lock()
	for k, v := range body {
		modulesConfig[k] = v
	}
	modulesMu.Unlock()
	c.JSON(http.StatusOK, gin.H{"status": "accepted"})
}

func handleGetModulesConfig(c *gin.Context) {
	modulesMu.RLock()
	defer modulesMu.RUnlock()
	c.JSON(http.StatusOK, modulesConfig)
}
