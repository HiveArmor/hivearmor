package main

import (
	"crypto/sha256"
	"errors"
	"strconv"
	"strings"

	"github.com/threatwinds/go-sdk/plugins"
)

const maxMessageBytes = 4 * 1024 * 1024

var (
	errMissingIdentity = errors.New("connector identity required")
	errTenantConflict  = errors.New("producer tenant conflicts with authenticated identity")
	errTenantUnbound   = errors.New("authenticated identity has no tenant")
	errIdentityRevoked = errors.New("connector identity revoked")
)

type ConnectorIdentity struct {
	Type              string
	ID                uint32
	ConnectorID       string
	TenantID          int64
	CredentialVersion uint32
}

func (id *ConnectorIdentity) TenantString() string {
	if id == nil || id.TenantID <= 0 {
		return ""
	}
	return strconv.FormatInt(id.TenantID, 10)
}

func (id *ConnectorIdentity) cacheKey() string {
	if id == nil {
		return ""
	}
	return id.Type + ":" + strconv.FormatUint(uint64(id.ID), 10)
}

func presentedKeyDigest(presented string) [32]byte {
	return sha256.Sum256([]byte(presented))
}

func bindLogIdentity(log *plugins.Log, identity *ConnectorIdentity) error {
	if log == nil {
		return errors.New("log is required")
	}
	if identity == nil || strings.TrimSpace(identity.ConnectorID) == "" {
		return errMissingIdentity
	}
	tenant := identity.TenantString()
	if tenant == "" {
		return errTenantUnbound
	}
	if presented := strings.TrimSpace(log.TenantId); presented != "" && presented != tenant {
		return errTenantConflict
	}
	log.TenantId = tenant
	if strings.TrimSpace(log.DataSource) == "" {
		log.DataSource = identity.ConnectorID
	}
	return nil
}
