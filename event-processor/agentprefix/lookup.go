// Package agentprefix provides the PostgreSQL-backed AgentPrefixLookupFn
// that resolves an agent identifier to its MSSP tenant prefix.
//
// The lookup function queries ha_client.client_prefix WHERE the agent_id maps
// to the tenant.  In HiveArmor's schema, agents belong to a tenant identified
// by client_prefix; the mapping is resolved via agent-manager but the
// client_prefix is stored in ha_client.
//
// Called once at event-processor startup via plugins.RegisterAgentPrefixLookup.
//
// Requirements: 3.8, 3.9, 3.10, 4.5
package agentprefix

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"

	"github.com/hivearmor/sdk/catcher"
	"github.com/hivearmor/sdk/plugins"
)

// Register opens a connection to PostgreSQL using the provided DSN and
// registers the AgentPrefixLookupFn on the global AgentPrefixCache.
//
// The DSN is obtained from config.PostgresDSN() in the caller.
// Returns the *sql.DB so the caller can close it on shutdown.
func Register(dsn string) (*sql.DB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, catcher.Error("cannot open agent prefix DB connection", err, nil)
	}
	// Validate the connection early.
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, catcher.Error("cannot ping agent prefix DB", err, nil)
	}

	plugins.RegisterAgentPrefixLookup(func(ctx context.Context, agentID string) (string, error) {
		return lookupPrefix(ctx, db, agentID)
	})

	return db, nil
}

// lookupPrefix queries ha_client for the client_prefix associated with the
// given agentID.  In HiveArmor's schema, agentID can be either:
//   - A UUID matching ha_client.id (agent-manager registration path)
//   - A client_prefix string (direct MSSP prefix lookup)
//
// Returns ("", nil) when no row is found (single-tenant / unregistered agent).
// Returns ("", catcher.Error(...)) on database errors.
//
// MUST NOT log the value of agentID, client_prefix, or any row content.
func lookupPrefix(ctx context.Context, db *sql.DB, agentID string) (string, error) {
	var clientPrefix string
	// Try matching on client_prefix first (MSSP direct lookup), then on id (UUID).
	err := db.QueryRowContext(ctx,
		`SELECT client_prefix
		   FROM ha_client
		  WHERE (client_prefix = $1 OR id::text = $1)
		    AND mssp_managed = true
		    AND client_prefix IS NOT NULL
		  LIMIT 1`,
		agentID,
	).Scan(&clientPrefix)

	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", catcher.Error("agent prefix DB lookup failed", err, map[string]any{
			"agent_id": agentID,
		})
	}
	return clientPrefix, nil
}

// MustRegister is like Register but calls catcher.Error-wrapped fatal if the
// DB cannot be opened or pinged.  Used at startup where failure is non-recoverable.
// Returns the *sql.DB for the caller to track and close on shutdown.
func MustRegister(dsn string) *sql.DB {
	db, err := Register(dsn)
	if err != nil {
		// Use fmt.Sprintf to produce a non-nil error string for the log —
		// the agent_id/prefix values are NOT included in the startup message.
		panic(fmt.Sprintf("agentprefix.MustRegister: %v", err))
	}
	return db
}
