-- =============================================================================
-- Initialize PostgreSQL databases for all HiveArmor services
-- This script runs on first container start only (pgdata volume empty)
-- =============================================================================

-- Note: 'hivearmor' database is already created by the POSTGRES_DB env var in the Dockerfile.
-- Only create the additional service databases here.

-- Agent Manager database
CREATE DATABASE agentmanager;

-- User Auditor database
CREATE DATABASE userauditor;
