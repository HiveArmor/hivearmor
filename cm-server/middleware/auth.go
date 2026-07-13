package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/hivearmor/cm-server/store"
)

type contextKey string

const (
	InstanceKey contextKey = "instance"
	AdminKey    contextKey = "admin"
)

// InstanceAuth validates requests using "id" and "key" HTTP headers.
// This exactly matches how the HiveArmor installer authenticates against the CM API.
func InstanceAuth(db *gorm.DB) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get("id")
			key := r.Header.Get("key")
			if id == "" || key == "" {
				jsonError(w, http.StatusUnauthorized, "missing id or key header")
				return
			}

			var inst store.Instance
			if err := db.Where("id = ? AND api_key = ?", id, key).First(&inst).Error; err != nil {
				jsonError(w, http.StatusUnauthorized, "invalid credentials")
				return
			}

			ctx := context.WithValue(r.Context(), InstanceKey, &inst)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// AdminAuth validates CI/ops requests using "Authorization: Bearer <id>:<key>" header.
func AdminAuth(db *gorm.DB) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearerToken(r)
			if token == "" {
				jsonError(w, http.StatusUnauthorized, "missing Authorization header")
				return
			}

			parts := strings.SplitN(token, ":", 2)
			if len(parts) != 2 {
				jsonError(w, http.StatusUnauthorized, "invalid token format, expected id:key")
				return
			}

			var acct store.AdminAccount
			if err := db.Where("id = ?", parts[0]).First(&acct).Error; err != nil {
				jsonError(w, http.StatusUnauthorized, "invalid credentials")
				return
			}

			if err := bcrypt.CompareHashAndPassword([]byte(acct.HashedKey), []byte(parts[1])); err != nil {
				jsonError(w, http.StatusUnauthorized, "invalid credentials")
				return
			}

			ctx := context.WithValue(r.Context(), AdminKey, &acct)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

func jsonError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
