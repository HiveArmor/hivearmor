# HiveArmor Server Autoinstall ISO

**HiveArmor** — Hyper-scale Incident Visibility Engine  
Enterprise SIEM/XDR platform | Ubuntu 22.04 LTS unattended installer

---

## Overview

This directory contains everything required to build a fully unattended Ubuntu 22.04 LTS ISO that installs and bootstraps a HiveArmor server node with no human interaction beyond selecting the boot menu entry.

Starting with Ubuntu 20.04, the server installer migrated from the legacy Debian pre-seed method to the **autoinstall** mechanism, which is a superset of cloud-init user-data. The Ubuntu installer (`ubiquity`) was reworked into `subiquity` (server ubiquity) to support this format. The autoinstall `user-data` YAML file contains directives for both cloud-init and the low-level install tool `curtin`.

### Directory layout

```
etc/iso/
├── README.md                          # this file
├── iso-build.sh                       # xorriso command to assemble the final ISO
├── source-files/
│   ├── boot/
│   │   └── grub/
│   │       └── grub.cfg               # GRUB boot menu — points installer at /cdrom/server/
│   └── server/
│       ├── meta-data                  # empty file required by cloud-init (nocloud source)
│       └── user-data                  # autoinstall YAML — the core of the unattended install
└── tools/
    ├── start.sh                       # post-install bootstrap: downloads and runs the HiveArmor installer binary
    └── finish-install-setup.sh        # interactive helper: set hostname and timezone, then reboot
```

---

## Step 0 — Prerequisites

Build the autoinstall ISO on an **Ubuntu 22.04** host. The following packages are required:

| Package | Purpose | Install |
|---|---|---|
| `p7zip-full` | Unpack the source ISO including MBR and EFI partition images | `sudo apt install p7zip-full` |
| `wget` | Download a fresh copy of the Ubuntu 22.04 server ISO | `sudo apt install wget` |
| `xorriso` | Assemble the modified bootable ISO | `sudo apt install xorriso` |

The two most common causes of a broken autoinstall ISO are:

- **YAML syntax errors** in `user-data` — the installer silently falls back to interactive mode.
- **Misconfigured storage layout** — the `storage` section is the most finicky part of the spec.

Always validate `user-data` with `python3 -c "import yaml, sys; yaml.safe_load(sys.stdin)" < source-files/server/user-data` before building.

---

## Step 1 — Set up the build environment

Create a working directory and download the Ubuntu 22.04 live server ISO:

```bash
mkdir -p /home/hivearmor/ISO/source-files
cd /home/hivearmor/ISO
wget https://cdimage.ubuntu.com/ubuntu-server/jammy/daily-live/current/jammy-live-server-amd64.iso
```

---

## Step 2 — Unpack the ISO with 7z

The Ubuntu 22.04 server ISO uses a GPT layout with three separate partitions (MBR, EFI, and the install root image). `7z` handles this cleanly — it extracts both the filesystem content and the raw partition images that are needed to recreate a bootable ISO:

```bash
cd /home/hivearmor/ISO
7z -y x jammy-live-server-amd64.iso -osource-files
```

After extraction `source-files/` will contain the ISO tree plus a directory named `[BOOT]`. That directory holds two partition images:

| File | Purpose |
|---|---|
| `[BOOT]/1-Boot-NoEmul.img` | MBR (master boot record) partition image |
| `[BOOT]/2-Boot-NoEmul.img` | EFI (UEFI) partition image |

Move the `[BOOT]` directory out of the source tree — it is passed directly to `xorriso` and must not appear inside the ISO:

```bash
mv 'source-files/[BOOT]' BOOT
```

---

## Step 3 — Configure the GRUB boot menu

Replace `source-files/boot/grub/grub.cfg` with the version in this repository. The critical change is the `linux` kernel line, which instructs the live environment to load autoinstall configuration from the `nocloud` data source at `/cdrom/server/`:

```
linux /casper/vmlinuz quiet autoinstall ds=nocloud\;s=/cdrom/server/ ---
```

The `grub.cfg` in `source-files/boot/grub/grub.cfg` is already configured for HiveArmor. Key menu entry:

```
menuentry "Install HiveArmor Server" {
    set gfxpayload=keep
    linux   /casper/vmlinuz quiet autoinstall ds=nocloud\;s=/cdrom/server/  ---
    initrd  /casper/initrd
}
```

To include multiple install profiles (for example, a minimal install vs. a full stack install), create additional subdirectories under `source-files/` and add corresponding `menuentry` blocks in `grub.cfg`. Each directory needs its own `user-data` and an empty `meta-data`.

---

## Step 4 — Create the autoinstall data files

The `nocloud` data source requires two files inside `source-files/server/`:

```bash
# meta-data must exist but can be empty
touch source-files/server/meta-data

# user-data contains the full autoinstall specification
# The version in this repo is pre-configured for HiveArmor
```

### user-data reference

The `source-files/server/user-data` file in this repository configures the following:

| Setting | Value |
|---|---|
| Locale | `en_US.UTF-8` |
| Keyboard | `us` |
| Default hostname | `HiveArmorServer` |
| Default username | `hivearmor` |
| SSH password auth | enabled |
| OpenSSH server | installed |
| Storage layout | `direct` (interactive — operator confirms disk selection) |
| APT sources | graphics-drivers PPA |
| Extra packages | `build-essential`, `network-manager`, `dkms`, `emacs-nox` |

**Late-commands (run inside the installed target before first boot):**

1. Migrate the network configuration from `systemd-networkd` to `NetworkManager` — all existing netplan files are renamed `.yaml-orig` and a new `01-netcfg.yaml` with `renderer: NetworkManager` is written.
2. `netplan generate` and `netplan apply` are run inside the target.
3. `NetworkManager.service` is enabled.

**Post-boot runcmd (runs on first boot via cloud-init):**

1. Downloads `start.sh` from the HiveArmor CDN to `/home/hivearmor/start.sh`, makes it executable, and runs it. The output is logged to `/home/hivearmor/installer.log`.
2. Downloads `finish-install-setup.sh` to `/home/hivearmor/finish-install-setup.sh` and makes it executable (run manually after the installer completes).
3. Prints the default credentials banner to the console.

**Default credentials printed at first login:**

```
********************************************************
 - Default Username: hivearmor
 - Default Password: hivearmor
Run: cd /home/hivearmor/ && chmod +x start.sh && ./start.sh
********************************************************
```

> Change the default password immediately after first login. The password hash in `user-data` is a SHA-512 crypt hash — regenerate it with `openssl passwd -6` before building a production ISO.

---

## Step 5 — Create the autoinstall server directory

If it does not already exist, create the directory that `grub.cfg` references:

```bash
mkdir -p source-files/server
```

You can add alternate configuration profiles in sibling directories (for example, `source-files/server-minimal/`) and point additional GRUB menu entries at them.

---

## Step 6 — Build the ISO

Run the build script from the `ISO/` working directory:

```bash
cd /home/hivearmor/ISO
bash /path/to/etc/iso/iso-build.sh
```

The script (`iso-build.sh`) performs two operations:

1. Calls `xorriso -report_el_torito` against the original source ISO to verify El Torito boot catalog parameters.
2. Assembles the modified ISO with the following `xorriso` flags:

| Flag | Purpose |
|---|---|
| `-V 'Ubuntu 22.04 LTS AUTO (EFIBIOS)'` | ISO volume label |
| `-o ../hivearmor-autoinstall.iso` | Output filename |
| `--grub2-mbr ../BOOT/1-Boot-NoEmul.img` | Embed the original MBR image |
| `-append_partition 2 ... ../BOOT/2-Boot-NoEmul.img` | Append the original EFI partition |
| `-appended_part_as_gpt` | Treat appended partitions as GPT entries |
| `-b /boot/grub/i386-pc/eltorito.img` | BIOS El Torito boot image |
| `-eltorito-alt-boot -e '--interval:appended_partition_2:::'` | UEFI El Torito boot image |

The output ISO supports both **BIOS** and **UEFI** boot. The resulting file is written to `/home/hivearmor/ISO/hivearmor-autoinstall.iso`.

---

## Step 7 — Boot and install

Write the ISO to a USB drive or mount it in a virtual machine / bare-metal BMC:

```bash
# Write to USB (replace /dev/sdX with the correct device — double-check before running)
sudo dd if=hivearmor-autoinstall.iso of=/dev/sdX bs=4M status=progress oflag=sync
```

Boot the target system from the ISO. The GRUB menu appears with a 30-second timeout. Select **Install HiveArmor Server**. The storage layout step is interactive (the operator confirms the disk selection); all other steps are unattended.

After the base OS install completes and the system reboots, cloud-init runs `start.sh`, which downloads and executes the HiveArmor installer binary. Progress is logged to `/home/hivearmor/installer.log`.

---

## Post-install: Finish setup

After the HiveArmor installer completes, run the finish-setup helper to configure the hostname and timezone before the final reboot:

```bash
cd /home/hivearmor
chmod +x finish-install-setup.sh
./finish-install-setup.sh
```

The script prompts for a hostname and a timezone (examples: `America/New_York`, `America/Chicago`, `America/Los_Angeles`), applies both with `hostnamectl` and `timedatectl`, then schedules a reboot in 3 seconds.

---

## Customising the autoinstall configuration

| What to change | Where |
|---|---|
| Hostname | `identity.hostname` in `user-data` |
| Default user / password hash | `identity.username` and `identity.password` in `user-data` (use `openssl passwd -6` to generate) |
| Storage layout | `storage` section in `user-data` — see [Ubuntu autoinstall storage reference](https://canonical-subiquity.readthedocs-hosted.com/en/latest/reference/autoinstall-reference.html#storage) |
| Extra packages | `packages` list in `user-data` |
| Bootstrap CDN URL | `runcmd` wget URLs in `user-data` |
| GRUB timeout | `set timeout=30` in `grub.cfg` |
| ISO volume label | `-V` flag in `iso-build.sh` |
| Output ISO filename | `-o` flag in `iso-build.sh` |

---

## Troubleshooting

**Installer drops to interactive mode instead of running unattended**  
The most common cause is a YAML parse error in `user-data`. Validate the file before building:
```bash
python3 -c "import yaml, sys; yaml.safe_load(sys.stdin)" < source-files/server/user-data
```

**System boots but cloud-init runcmd does not run**  
Verify that `user-data` starts with exactly `#cloud-config` on the first line (no BOM, no leading whitespace).

**ISO does not boot on UEFI systems**  
Ensure the `BOOT/2-Boot-NoEmul.img` EFI partition image was correctly extracted by `7z` and that the `-append_partition` argument in `iso-build.sh` points to the correct path.

**Installer hangs at storage layout**  
The `user-data` in this repository sets `interactive-sections: [storage]` intentionally, so the operator can confirm disk selection on bare metal. Remove that section for a fully unattended disk wipe (use with caution).

---

## References

- [Ubuntu Autoinstall Reference](https://canonical-subiquity.readthedocs-hosted.com/en/latest/reference/autoinstall-reference.html)
- [cloud-init nocloud data source](https://cloudinit.readthedocs.io/en/latest/reference/datasources/nocloud.html)
- [curtin storage configuration](https://curtin.readthedocs.io/en/latest/topics/storage.html)
- [HiveArmor Documentation](https://docs.hivearmor.io)
- [HiveArmor GitHub](https://github.com/hivearmor)
- Support: support@hivearmor.io
