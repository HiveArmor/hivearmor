package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// injectKeyAuth returns a Gin middleware that requires the caller to supply the
// correct API key via the X-Inject-Key header (or ?key= query param as fallback).
// When expectedKey is empty the middleware blocks all requests — a missing env
// var must not silently allow open access.
func injectKeyAuth(expectedKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetHeader("X-Inject-Key")
		if key == "" {
			key = c.Query("key")
		}
		if expectedKey == "" || key != expectedKey {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		c.Next()
	}
}
