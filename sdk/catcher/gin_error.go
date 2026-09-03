//go:build !agent_slim

package catcher

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GinError is a helper function to return an error to the client using Gin framework context.
// It sets the headers x-error and x-error-id with the error message and UUID respectively,
// writes a JSON error body, and sets the status code.
// Additional Args keys:
//   - "retry": N — sets the Retry-After header to N seconds.
//   - "code_override": string — overrides the error code in the response body.
//   - "param": string — included as "param" in the response error detail.
//
// Omitted from agent builds with -tags agent_slim (AGT-SIZE-01) so gin is not linked.
func (e SdkError) GinError(c *gin.Context) {
	secureMsg := e.SecureString()
	c.Header("x-error-id", e.Code)
	c.Header("x-error", secureMsg)

	if retryVal, ok := e.Args["retry"]; ok {
		retry := castInt(retryVal)
		if retry > 0 {
			c.Header("Retry-After", strconv.Itoa(retry))
		}
	}

	resp := errorResponse{
		Error: errorParam{
			Message: secureMsg,
			Type:    e.Severity,
			Code:    e.Code,
		},
	}

	if codeOverride, ok := e.Args["code_override"]; ok {
		resp.Error.Code, _ = codeOverride.(string)
	}
	if param, ok := e.Args["param"]; ok {
		if p, ok := param.(string); ok {
			resp.Error.Param = p
		}
	}

	statusCode := http.StatusInternalServerError
	if status, ok := e.Args["status"]; ok {
		statusCode = castInt(status)
	}
	c.AbortWithStatusJSON(statusCode, resp)
}
