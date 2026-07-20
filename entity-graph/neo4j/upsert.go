package neo4j

import (
	"context"
	"time"

	"github.com/hivearmor/entity-graph/extractor"
)

// UpsertIP merges an IpAddress node, setting geo/threat metadata.
func (c *Client) UpsertIP(ctx context.Context, ip extractor.IpEntity) error {
	return c.run(ctx, `
		MERGE (n:IpAddress {address: $address})
		ON CREATE SET n.firstSeen = $now, n.riskScore = 0.0
		SET n.lastSeen    = $now,
		    n.country     = $country,
		    n.asn         = $asn,
		    n.isMalicious = $isMalicious
	`, map[string]any{
		"address":     ip.Address,
		"now":         time.Now().UTC(),
		"country":     ip.Country,
		"asn":         ip.ASN,
		"isMalicious": ip.IsMalicious,
	})
}

// UpsertHost merges a Host node.
func (c *Client) UpsertHost(ctx context.Context, h extractor.HostEntity) error {
	return c.run(ctx, `
		MERGE (n:Host {hostname: $hostname})
		ON CREATE SET n.firstSeen = $now, n.riskScore = 0.0
		SET n.lastSeen = $now
	`, map[string]any{
		"hostname": h.Hostname,
		"now":      time.Now().UTC(),
	})
}

// UpsertUser merges a User node.
func (c *Client) UpsertUser(ctx context.Context, u extractor.UserEntity) error {
	return c.run(ctx, `
		MERGE (n:User {username: $username})
		ON CREATE SET n.firstSeen = $now, n.riskScore = 0.0
		SET n.lastSeen = $now
	`, map[string]any{
		"username": u.Username,
		"now":      time.Now().UTC(),
	})
}

// UpsertProcess merges a Process node. sha256 is used as the key when present,
// otherwise the process name is used so we don't scatter anonymous processes.
func (c *Client) UpsertProcess(ctx context.Context, p extractor.ProcessEntity) error {
	if p.SHA256 != "" {
		return c.run(ctx, `
			MERGE (n:Process {sha256: $sha256})
			ON CREATE SET n.firstSeen = $now, n.riskScore = 0.0
			SET n.lastSeen = $now, n.name = $name
		`, map[string]any{
			"sha256": p.SHA256,
			"name":   p.Name,
			"now":    time.Now().UTC(),
		})
	}
	return c.run(ctx, `
		MERGE (n:Process {name: $name})
		ON CREATE SET n.firstSeen = $now, n.riskScore = 0.0
		SET n.lastSeen = $now
	`, map[string]any{
		"name": p.Name,
		"now":  time.Now().UTC(),
	})
}

// UpsertFile merges a File node keyed by path.
func (c *Client) UpsertFile(ctx context.Context, f extractor.FileEntity) error {
	return c.run(ctx, `
		MERGE (n:File {path: $path})
		ON CREATE SET n.firstSeen = $now
		SET n.lastSeen = $now
	`, map[string]any{
		"path": f.Path,
		"now":  time.Now().UTC(),
	})
}

// UpsertDomain merges a Domain node.
func (c *Client) UpsertDomain(ctx context.Context, d extractor.DomainEntity) error {
	return c.run(ctx, `
		MERGE (n:Domain {name: $name})
		ON CREATE SET n.firstSeen = $now, n.riskScore = 0.0
		SET n.lastSeen = $now
	`, map[string]any{
		"name": d.Name,
		"now":  time.Now().UTC(),
	})
}

// CreateLoginRelationship creates or increments the LOGGED_INTO edge between a
// User and a Host. The edge is keyed by calendar date so daily counts accumulate
// without creating an edge-per-event.
func (c *Client) CreateLoginRelationship(ctx context.Context, username, hostname string, ts time.Time) error {
	return c.run(ctx, `
		MATCH (u:User {username: $user})
		MATCH (h:Host  {hostname: $host})
		MERGE (u)-[r:LOGGED_INTO {date: date($ts)}]->(h)
		SET r.lastSeen = $ts,
		    r.count    = COALESCE(r.count, 0) + 1
	`, map[string]any{
		"user": username,
		"host": hostname,
		"ts":   ts.UTC(),
	})
}

// CreateCommunicatedWith creates or increments a COMMUNICATED_WITH edge from a
// Host to an IpAddress.
func (c *Client) CreateCommunicatedWith(ctx context.Context, hostname, ipAddress string, ts time.Time) error {
	return c.run(ctx, `
		MATCH (h:Host      {hostname: $host})
		MATCH (i:IpAddress {address:  $ip})
		MERGE (h)-[r:COMMUNICATED_WITH {date: date($ts)}]->(i)
		SET r.lastSeen = $ts,
		    r.count    = COALESCE(r.count, 0) + 1
	`, map[string]any{
		"host": hostname,
		"ip":   ipAddress,
		"ts":   ts.UTC(),
	})
}

// LinkAlertToEntities creates (:Alert)-[:INVOLVES]->() edges for all entity
// references in the alert.
func (c *Client) LinkAlertToEntities(ctx context.Context, alert extractor.AlertEntity) error {
	// Upsert the Alert node itself first.
	if err := c.run(ctx, `
		MERGE (n:Alert {alertId: $alertId})
		ON CREATE SET n.firstSeen = $now
		SET n.lastSeen = $now, n.severity = $severity
	`, map[string]any{
		"alertId":  alert.AlertID,
		"now":      time.Now().UTC(),
		"severity": alert.Severity,
	}); err != nil {
		return err
	}

	for _, ip := range alert.InvolvedIPs {
		if err := c.run(ctx, `
			MATCH (a:Alert     {alertId: $alertId})
			MATCH (n:IpAddress {address: $value})
			MERGE (a)-[:INVOLVES]->(n)
		`, map[string]any{"alertId": alert.AlertID, "value": ip}); err != nil {
			return err
		}
	}
	for _, h := range alert.InvolvedHosts {
		if err := c.run(ctx, `
			MATCH (a:Alert {alertId: $alertId})
			MATCH (n:Host  {hostname: $value})
			MERGE (a)-[:INVOLVES]->(n)
		`, map[string]any{"alertId": alert.AlertID, "value": h}); err != nil {
			return err
		}
	}
	for _, u := range alert.InvolvedUsers {
		if err := c.run(ctx, `
			MATCH (a:Alert {alertId: $alertId})
			MATCH (n:User  {username: $value})
			MERGE (a)-[:INVOLVES]->(n)
		`, map[string]any{"alertId": alert.AlertID, "value": u}); err != nil {
			return err
		}
	}
	return nil
}
