package serv

import (
	"context"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/kardianos/service"

	pb "github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/collector"
	"github.com/hivearmor/agent/collector/dns"
	"github.com/hivearmor/agent/collector/ebpf"
	"github.com/hivearmor/agent/collector/esf"
	"github.com/hivearmor/agent/collector/etw"
	"github.com/hivearmor/agent/collector/fim"
	"github.com/hivearmor/agent/collector/netconn"
	"github.com/hivearmor/agent/collector/usb"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/database"
	"github.com/hivearmor/agent/dependency"
	"github.com/hivearmor/agent/models"
	"github.com/hivearmor/agent/tamper"
	"github.com/hivearmor/agent/telemetry"
	"github.com/hivearmor/agent/utils"
	"google.golang.org/grpc/metadata"
)

const shutdownTimeout = 30 * time.Second

type program struct {
	cancel context.CancelFunc
	wg     sync.WaitGroup
	mu     sync.Mutex
}

func (p *program) Start(_ service.Service) error {
	go p.run()
	return nil
}

func (p *program) Stop(_ service.Service) error {
	utils.Logger.Info("Stopping HiveArmor Agent...")

	p.mu.Lock()
	cancel := p.cancel
	p.mu.Unlock()

	if cancel != nil {
		cancel()
	}

	// Stop all legacy collectors (syslog, netflow, file, platform)
	collector.StopAll()

	// Wait for goroutines with timeout
	done := make(chan struct{})
	go func() {
		p.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		utils.Logger.Info("All goroutines stopped gracefully")
	case <-time.After(shutdownTimeout):
		utils.Logger.ErrorF("Shutdown timeout after %v, some goroutines may not have stopped", shutdownTimeout)
	}

	// Close database
	if db, err := database.GetDB(); err == nil && db != nil {
		if err := db.Close(); err != nil {
			utils.Logger.ErrorF("error closing database: %v", err)
		}
	}

	utils.Logger.Info("HiveArmor Agent stopped")
	return nil
}

// goSafe launches a goroutine with panic recovery and WaitGroup tracking.
// All goroutines are tracked so Stop() can wait for clean shutdown.
func (p *program) goSafe(name string, fn func()) {
	p.wg.Add(1)
	go func() {
		defer p.wg.Done()
		defer func() {
			if r := recover(); r != nil {
				utils.Logger.ErrorF("panic in %s: %v", name, r)
			}
		}()
		fn()
	}()
}

func (p *program) run() {
	utils.InitLogger(config.ServiceLogFile)
	cnf, err := config.GetCurrentConfig()
	if err != nil {
		utils.Logger.Fatal("error getting config: %v", err)
	}

	db, err := database.GetDB()
	if err != nil {
		utils.Logger.ErrorF("error initializing database: %v", err)
	} else if err = db.Migrate(models.Log{}); err != nil {
		utils.Logger.ErrorF("error migrating logs table: %v", err)
	}

	// Reconcile dependencies (updater, beats, etc.) before starting collectors
	if err := dependency.Reconcile(cnf.Server, cnf.SkipCertValidation); err != nil {
		utils.Logger.ErrorF("error reconciling dependencies: %v", err)
		// Continue anyway - agent should try to run with what it has
	}

	ctx, cancel := context.WithCancel(context.Background())
	p.mu.Lock()
	p.cancel = cancel
	p.mu.Unlock()

	// Start tamper protection watchdog (all platforms, all modes).
	watchdog := tamper.NewWatchdog(func(reason string) {
		utils.Logger.ErrorF("TAMPER ALERT: %s", reason)
	})
	p.goSafe("TamperWatchdog", func() {
		watchdog.Start(ctx)
	})

	ctx = metadata.AppendToOutgoingContext(ctx, "key", cnf.AgentKey)
	ctx = metadata.AppendToOutgoingContext(ctx, "id", strconv.Itoa(int(cnf.AgentID)))
	ctx = metadata.AppendToOutgoingContext(ctx, "type", "agent")

	// Core agent goroutines — run in all modes.
	p.goSafe("IncidentResponseStream", func() {
		pb.IncidentResponseStream(cnf, ctx)
	})

	p.goSafe("StartPing", func() {
		pb.StartPing(cnf, ctx)
	})

	p.goSafe("ProcessLogs", func() {
		logProcessor, err := pb.GetLogProcessor()
		if err != nil {
			utils.Logger.ErrorF("error initializing log processor: %v", err)
			return
		}
		logProcessor.ProcessLogs(cnf, ctx)
	})

	p.goSafe("UpdateAgent", func() {
		pb.UpdateAgent(cnf, ctx)
	})

	p.goSafe("HostTelemetry", func() {
		telemetry.StartLoop(ctx, cnf)
	})

	// Sync collector config with current version's ProtoPorts
	if err := collector.SyncCollectorConfig(); err != nil {
		utils.Logger.ErrorF("error syncing collector config: %v", err)
	}

	// EDR subsystems — only started in EDR mode.
	if cnf.IsEDR() {
		// Legacy Linux /proc-poll EDR (context-aware; exits when ctx cancelled).
		p.goSafe("StartEdrCollector", func() {
			pb.StartEdrCollectorWithContext(cnf, ctx)
		})

		// eBPF collector (Linux only; no-op on other platforms).
		// Falls back to auditd when BTF is unavailable.
		ebpfCollector := ebpf.New(cnf)
		p.goSafe("EBPFCollector", func() {
			ebpfCollector.Start(ctx, pb.LogQueue)
		})

		// ETW collector (Windows only; no-op on Linux/macOS).
		// Zero-latency process/network/DNS/PowerShell events via ETW.
		etwCollector := etw.New(cnf)
		p.goSafe("ETWCollector", func() {
			etwCollector.Start(ctx, pb.LogQueue)
		})

		// ESF collector (macOS only; no-op on Linux/Windows).
		// Requires Apple com.apple.developer.endpoint-security.client entitlement.
		esfCollector := esf.New(cnf)
		p.goSafe("ESFCollector", func() {
			esfCollector.Start(ctx, pb.LogQueue)
		})

		// FIM engine — file integrity monitoring (all platforms).
		fimCollector := fim.New(cnf)
		p.goSafe("FIMCollector", func() {
			fimCollector.Start(ctx, pb.LogQueue)
		})

		// DNS telemetry (Linux tcpdump+/proc; Windows via ETW; macOS via ESF).
		dnsCollector := dns.New(cnf)
		p.goSafe("DNSCollector", func() {
			dnsCollector.Start(ctx, pb.LogQueue)
		})

		// Per-process network connection telemetry (all platforms).
		netconnCollector := netconn.New(cnf)
		p.goSafe("NetConnCollector", func() {
			netconnCollector.Start(ctx, pb.LogQueue)
		})

		// USB / removable media event collector (Linux inotify; Windows/macOS via ETW/ESF).
		usbCollector := usb.New(cnf)
		p.goSafe("USBCollector", func() {
			usbCollector.Start(ctx, pb.LogQueue)
		})
	}

	// Start legacy log collectors (syslog, netflow, file, platform).
	// These run in both log-only and EDR modes.
	collector.StartAll(ctx)

	// Wait for shutdown signal
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-signals:
		utils.Logger.Info("Received signal: %v", sig)
	case <-ctx.Done():
		utils.Logger.Info("Context cancelled")
	}
}
