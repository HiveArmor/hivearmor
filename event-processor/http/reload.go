package http

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/hivearmor/event-processor/rules"
)

func registerReloadRoutes(r *gin.Engine) {
	internalKey := os.Getenv("INTERNAL_KEY")
	r.POST("/api/rules/reload", internalKeyAuth(internalKey), handleRuleReload)
}

// handleRuleReload triggers an immediate rule reload in the background and
// returns 202 Accepted so the caller is not blocked.
func handleRuleReload(c *gin.Context) {
	go func() {
		if err := rules.Reload(); err != nil {
			log.Printf("rules: webhook reload failed: %v", err)
			return
		}
		log.Printf("rules: reloaded via webhook trigger")
	}()
	c.JSON(http.StatusAccepted, gin.H{"status": "reload initiated"})
}
