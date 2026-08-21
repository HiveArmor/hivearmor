# Staging backup and restore (SIEM-009 / ACC-12 subset)

This is **not** a clean-server rebuild, not a 24-hour soak, and not an off-box WORM copy. Label remains **`STAGING CANDIDATE`**.

## What is proven

1. PostgreSQL logical dump of `hivearmor` and `agentmanager`.
2. Restore of `hivearmor` into a throwaway database `hivearmor_restore_drill` and row-count comparison for selected tables. The live database is not replaced.
3. OpenSearch filesystem snapshot under `path.repo` into `/usr/share/opensearch/data/ha-snapshots` (OpenSearch data volume). One data index is restored as `restore-drill-*`, counted, then deleted.
4. **Off-volume copy** of dumps + `opensearch-ha-snapshots.tar.gz` to `/var/backups/hivearmor-offhost/<stamp>/` on the VM root disk (outside the OpenSearch docker volume).
5. **Second-host copy** of that stamp to the Windows ACC-02 VM (`C:\ha-agent-test\offbox-backups\<stamp>\`) — same VPC, not WORM.
6. Redpanda **named** volume `redpanda_data`; topic + high-watermark retained across container recreate (`run-siem009-redpanda-volume.sh`).
7. OpenSearch ISM policy `ha-hot-retention`: `v3-hive-*` → delete after **14d**.
8. Measured SLO/lag **signals** JSON (`run-siem009-slo-lag.sh`) — no invented pass/fail thresholds.
9. Admin UI board at `/admin/pipeline-signals` (`GET /api/ha-pipeline-signals`) merging live OpenSearch/Postgres probes with the host soak `latest.json` and `soakHistory`.
10. Hourly soak timer (`hivearmor-slo-soak.timer`) writing samples under `~/hivearmor-slo-soak/`.
11. Capacity JSON (database bytes, cluster status, store size).
12. Soak evidence pack collector: `bash deploy/staging/collect-siem009-soak-pack.sh` (PARTIAL until span ≥24h).

## What remains open

- Restore onto a **brand-new Linux VM** (deferred until after production-ready gate)
- Commercial AWS S3 / Glacier Object Lock (optional; staging MinIO COMPLIANCE drill is live via `run-siem009-worm-object-lock.sh`)
- Completed 24h soak evidence pack (timer running; re-run collector after ~2026-08-22 09:25 UTC)
- Redpanda restore from an off-box tar (volume persist is proven)
- Grafana (optional; frontend board is the staging path)

## Commands

```bash
bash deploy/staging/run-siem009-backup-restore.sh
bash deploy/staging/run-siem009-redpanda-volume.sh
bash deploy/staging/run-siem009-slo-lag.sh
bash deploy/staging/run-siem009-slo-soak-sample.sh
# From a host that has the staging PEM + Windows SSH:
bash deploy/staging/run-siem009-offbox-windows.sh
bash deploy/staging/run-siem009-worm-object-lock.sh   # MinIO COMPLIANCE Object Lock (or HA_WORM_MODE=s3)
```

Optional soak timer:

```bash
sudo cp deploy/staging/hivearmor-slo-soak.service deploy/staging/hivearmor-slo-soak.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hivearmor-slo-soak.timer
```

Optional host timer (install on the staging VM):

```bash
sudo cp deploy/staging/hivearmor-backup.service deploy/staging/hivearmor-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hivearmor-backup.timer
```
