package neo4j

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// Client wraps the Neo4j driver and exposes a single session per operation.
type Client struct {
	driver neo4j.DriverWithContext
}

// New creates a new Client and verifies connectivity.
func New(uri, user, password string) (*Client, error) {
	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		return nil, fmt.Errorf("neo4j driver: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := driver.VerifyConnectivity(ctx); err != nil {
		_ = driver.Close(context.Background())
		return nil, fmt.Errorf("neo4j connectivity: %w", err)
	}
	log.Printf("Connected to Neo4j at %s", uri)
	return &Client{driver: driver}, nil
}

// Close releases the driver.
func (c *Client) Close() {
	_ = c.driver.Close(context.Background())
}

// run executes a single write transaction.
func (c *Client) run(ctx context.Context, query string, params map[string]any) error {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		result, err := tx.Run(ctx, query, params)
		if err != nil {
			return nil, err
		}
		// consume the result to surface server-side errors
		_, err = result.Consume(ctx)
		return nil, err
	})
	return err
}
