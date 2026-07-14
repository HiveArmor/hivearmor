# HiveArmor — Container Configs & Infrastructure (`etc/`)

Base Docker configurations, ISO build tooling, and infrastructure support files for HiveArmor deployments.

---

## Overview

The `etc/` directory contains the foundational infrastructure artifacts that underpin HiveArmor deployments. This includes custom container image definitions, Ubuntu autoinstall ISO build tooling for bare-metal provisioning, and post-install setup scripts.

---

## Directory Structure

```
etc/
├── iso/                    # Ubuntu autoinstall ISO builder for bare-metal deployments
│   ├── iso-build.sh        # xorriso command to produce the bootable ISO
│   ├── README.md           # Detailed step-by-step ISO build instructions
│   └── tools/
│       ├── start.sh        # Post-boot launcher: downloads and runs the HiveArmor installer
│       └── finish-install-setup.sh  # Interactive post-install: sets hostname and timezone
└── opensearch/
    └── 2.x/
        └── Dockerfile      # Custom OpenSearch 2.x container image (ports 9200, 9600)
```

---

## Subdirectories

### `iso/`

Contains everything needed to produce a custom Ubuntu 22.04 LTS autoinstall ISO for bare-metal HiveArmor appliance deployments. The ISO uses Ubuntu's `subiquity` autoinstall mechanism (cloud-init-compatible `user-data`) to perform an unattended install, then runs `start.sh` to pull the latest HiveArmor installer from GitHub Releases and execute it.

**Output artifact:** `hivearmor-autoinstall.iso` — a bootable BIOS/UEFI hybrid ISO.

Key files:

| File | Purpose |
|---|---|
| `iso-build.sh` | Invokes `xorriso` to repack the modified Ubuntu source ISO into the final bootable image |
| `tools/start.sh` | Runs on first boot; downloads and executes the HiveArmor installer binary |
| `tools/finish-install-setup.sh` | Interactive script to set the system hostname and timezone, then reboots |

See `iso/README.md` for the full five-step build walkthrough (prerequisites, unpacking, `grub.cfg` edits, `user-data` authoring, and ISO generation).

### `opensearch/`

Custom Docker image definitions for OpenSearch, HiveArmor's log-storage backend.

| Path | Base image | Exposed ports |
|---|---|---|
| `opensearch/2.x/Dockerfile` | `opensearchproject/opensearch:latest` | 9200 (REST), 9600 (Performance Analyzer) |

The HiveArmor event pipeline writes all indexed log data to OpenSearch using the locked index pattern `_v3_hive_<type>-YYYY.MM.DD`. Do not modify this image in ways that would affect index compatibility or cluster authentication.

---

## When to Use This Directory

| Task | What to touch |
|---|---|
| Deploying HiveArmor to bare metal (no existing OS) | `iso/` — build a custom autoinstall ISO |
| Customizing the unattended OS install (disk layout, locale, packages) | `iso/tools/` + `user-data` (see `iso/README.md`) |
| Changing the OpenSearch container version or adding plugins | `opensearch/2.x/Dockerfile` |
| Modifying first-boot behavior (installer URL, hostname setup) | `iso/tools/start.sh`, `iso/tools/finish-install-setup.sh` |

---

## Building the Bare-Metal ISO

Prerequisites (Ubuntu 22.04 build host):

```bash
sudo apt install p7zip wget xorriso
```

Quick build sequence:

```bash
mkdir -p ~/ISO/source-files && cd ~/ISO
wget https://cdimage.ubuntu.com/ubuntu-server/jammy/daily-live/current/jammy-live-server-amd64.iso
7z -y x jammy-live-server-amd64.iso -osource-files
mv source-files/'[BOOT]' BOOT

# Add grub.cfg, user-data, and meta-data per iso/README.md, then:
bash iso/iso-build.sh
```

The resulting ISO boots on BIOS and UEFI systems. On first boot, `start.sh` downloads the HiveArmor installer from `https://github.com/hivearmor/releases` and begins the guided setup.

---

## Docker Image Build

```bash
# Build the custom OpenSearch image locally
docker build -t hivearmor/opensearch:2.x etc/opensearch/2.x/

# CI/prod images are published to:
# ghcr.io/hivearmor/opensearch:2.x
```

---

## Related Resources

- Full deployment guide: https://docs.hivearmor.io
- Installer source: `installer/` (Go binary, handles Docker install, TLS cert generation, first-run setup)
- Local development stack: `local-dev/` (Docker Compose, no ISO needed)
- Support: support@hivearmor.io