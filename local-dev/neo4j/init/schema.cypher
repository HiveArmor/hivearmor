// ============================================================
// HiveArmor Security Knowledge Graph — Schema
// Apply once after first start:
//   docker exec hivearmor-neo4j cypher-shell -u neo4j -p 'localdev123!' \
//     -f /docker-entrypoint-initdb.d/schema.cypher
// ============================================================

// --- Uniqueness constraints (also create a backing index) ---
CREATE CONSTRAINT ip_unique     IF NOT EXISTS FOR (n:IpAddress) REQUIRE n.address   IS UNIQUE;
CREATE CONSTRAINT host_unique   IF NOT EXISTS FOR (n:Host)      REQUIRE n.hostname  IS UNIQUE;
CREATE CONSTRAINT domain_unique IF NOT EXISTS FOR (n:Domain)    REQUIRE n.name      IS UNIQUE;

// --- Additional lookup indexes ---
CREATE INDEX user_name    IF NOT EXISTS FOR (n:User)    ON (n.username);
CREATE INDEX process_hash IF NOT EXISTS FOR (n:Process) ON (n.sha256);
CREATE INDEX file_path    IF NOT EXISTS FOR (n:File)    ON (n.path);
CREATE INDEX alert_id     IF NOT EXISTS FOR (n:Alert)   ON (n.alertId);

// ============================================================
// Relationship types (reference — Neo4j requires no DDL)
// ============================================================
// (:IpAddress)-[:RESOLVED_TO]->(:Domain)       IP → DNS hostname
// (:IpAddress)-[:BELONGS_TO]->(:Host)           IP → physical/virtual host
// (:User)-[:LOGGED_INTO]->(:Host)               Authentication event
// (:User)-[:LOGGED_INTO_FROM]->(:IpAddress)     Source IP of login
// (:Process)-[:SPAWNED_BY]->(:Process)          Parent-child process tree
// (:Process)-[:RUNNING_ON]->(:Host)             Execution context
// (:Process)-[:MODIFIED]->(:File)               File write/create/delete
// (:Process)-[:CONNECTED_TO]->(:IpAddress)      Outbound network connection
// (:Host)-[:COMMUNICATED_WITH]->(:IpAddress)    Host-level network event
// (:Alert)-[:INVOLVES]->(:IpAddress)            Alert → entity links
// (:Alert)-[:INVOLVES]->(:User)
// (:Alert)-[:INVOLVES]->(:Host)
// (:Alert)-[:INVOLVES]->(:Process)

// ============================================================
// Common properties (not enforced, documented here)
// ============================================================
// All nodes:    riskScore (float 0-100), firstSeen (datetime), lastSeen (datetime)
// IpAddress:    country, asn, isMalicious, threatIntelProvider
// Host:         os, criticality, owner, assetId
// User:         domain, department, isPrivileged
// Process:      commandLine, parentPid, integrity
