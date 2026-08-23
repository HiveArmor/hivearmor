package logservice

import (
	"github.com/hivearmor/hivearmor-collector/config"
	"github.com/hivearmor/hivearmor-collector/spool"
	"github.com/hivearmor/sdk/plugins"
)

// BindTenant stamps plugins.Log.TenantId from collector config.
// Fail-closed: returns config.ErrTenantRequired when unbound.
func BindTenant(cnf *config.Config, log *plugins.Log) error {
	if err := cnf.RequireTenant(); err != nil {
		return err
	}
	if log == nil {
		return config.ErrTenantRequired
	}
	log.TenantId = cnf.TenantString()
	return nil
}

// OfferBound stamps tenant identity then durably enqueues.
// Unbound collectors write to DLQ and do not enqueue.
func OfferBound(cnf *config.Config, source string, log *plugins.Log) {
	if err := BindTenant(cnf, log); err != nil {
		spool.WriteToDLQ(source+":tenant-unbound", log)
		return
	}
	spool.Offer(LogQueue, source, log)
}
