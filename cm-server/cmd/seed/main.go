// seed creates or updates an admin account in the CM database.
// Run once to bootstrap CI service accounts.
//
// Usage:
//   DATABASE_URL=postgres://... go run ./cmd/seed --id ci-prod --role ci
//
// It prints the plaintext key once (store it in GitHub Secrets as part of
// CM_SERVICE_ACCOUNT_PROD: {"id":"ci-prod","key":"<printed value>"}).
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/hivearmor/cm-server/store"
)

func main() {
	id := flag.String("id", "", "account ID (e.g. ci-dev, ci-prod, ops)")
	role := flag.String("role", "ci", "role: ci | ops")
	flag.Parse()

	if *id == "" {
		log.Fatal("-id is required")
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}

	db, err := store.Connect(dsn)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	if err := store.Migrate(db); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	plainKey := uuid.NewString()
	hashed, err := bcrypt.GenerateFromPassword([]byte(plainKey), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("bcrypt: %v", err)
	}

	acct := store.AdminAccount{
		ID:        *id,
		HashedKey: string(hashed),
		Role:      *role,
		CreatedAt: time.Now().UTC(),
	}

	result := db.Where(store.AdminAccount{ID: *id}).
		Assign(store.AdminAccount{HashedKey: string(hashed), Role: *role}).
		FirstOrCreate(&acct)
	if result.Error != nil {
		log.Fatalf("upsert: %v", result.Error)
	}

	// The token used in Authorization: Bearer <id>:<key>
	token := fmt.Sprintf("%s:%s", *id, plainKey)

	fmt.Println("─────────────────────────────────────────────────────")
	fmt.Printf("Account ID  : %s\n", *id)
	fmt.Printf("Role        : %s\n", *role)
	fmt.Printf("Bearer token: %s\n", token)
	fmt.Println()
	fmt.Println("Store this JSON in GitHub Secret CM_SERVICE_ACCOUNT_PROD (or _DEV):")
	fmt.Printf(`{"id":"%s","key":"%s"}`, *id, plainKey)
	fmt.Println()
	fmt.Println("─────────────────────────────────────────────────────")
	fmt.Println("The plaintext key will NOT be shown again.")
}
