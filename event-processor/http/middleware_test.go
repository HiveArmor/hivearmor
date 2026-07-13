package http

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func newTestRouter(key string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/v1/inject", injectKeyAuth(key), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	return r
}

func TestInjectKeyAuth_withCorrectHeader_allows(t *testing.T) {
	r := newTestRouter("secret-key")
	req := httptest.NewRequest(http.MethodPost, "/v1/inject", nil)
	req.Header.Set("X-Inject-Key", "secret-key")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestInjectKeyAuth_withCorrectQueryParam_allows(t *testing.T) {
	r := newTestRouter("secret-key")
	req := httptest.NewRequest(http.MethodPost, "/v1/inject?key=secret-key", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestInjectKeyAuth_withWrongKey_blocks(t *testing.T) {
	r := newTestRouter("secret-key")
	req := httptest.NewRequest(http.MethodPost, "/v1/inject", nil)
	req.Header.Set("X-Inject-Key", "wrong-key")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestInjectKeyAuth_withNoKey_blocks(t *testing.T) {
	r := newTestRouter("secret-key")
	req := httptest.NewRequest(http.MethodPost, "/v1/inject", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestInjectKeyAuth_withEmptyConfigKey_blocksAll(t *testing.T) {
	// Empty config key must never allow open access.
	r := newTestRouter("")
	req := httptest.NewRequest(http.MethodPost, "/v1/inject", nil)
	req.Header.Set("X-Inject-Key", "")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 when key unconfigured, got %d", w.Code)
	}
}
