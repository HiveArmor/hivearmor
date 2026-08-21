---
name: disk-forensics
description: Digital disk forensics — image integrity verification, partition mapping, file system analysis, deleted file recovery, file carving (foremost/bulk_extractor), metadata extraction, timeline reconstruction (log2timeline/mactime). Triggered by "disk forensics", "forensic image analysis", "recover deleted files", "digital evidence", "timeline reconstruction".
---

# Disk Forensics

Digital evidence recovery from disk images, file systems, and memory captures.

## Authorization Requirements

Before analysis begins:
1. **Lawful basis** — IR engagement, CTF, or your own system
2. **Chain of custody** — image integrity preserved, or explicitly non-evidentiary scope stated
3. **Privacy scope** — analysis stays within authorized boundaries

## Phase 1 — Image Integrity

```bash
# Always work on copies — NEVER originals
# Verify hash before and after analysis
sha256sum disk.img > disk.img.sha256
md5sum disk.img >> disk.img.sha256

# EWF (Expert Witness Format) images
ewfinfo disk.E01
ewfverify disk.E01  # validates embedded hash

# Mount read-only
sudo mount -o ro,noexec,noload disk.img /mnt/evidence
```

## Phase 2 — Partition Mapping

```bash
# List partitions
mmls disk.img
fdisk -l disk.img

# Calculate partition offset (sectors × 512)
# Example: partition starts at sector 2048
OFFSET=$((2048 * 512))
sudo mount -o ro,loop,offset=$OFFSET disk.img /mnt/partition
```

## Phase 3 — File System Analysis

```bash
# List all files including deleted (marked with asterisk)
fls -r -d disk.img > file-list.txt

# Extract specific file by inode number
icat disk.img <inode_number> > extracted_file

# File system statistics
fsstat disk.img
```

## Phase 4 — Artifact Recovery

```bash
# Foremost — file carving by header/footer signatures
foremost -t all -i disk.img -o ./recovered/

# bulk_extractor — extract emails, URLs, credit cards, phone numbers from disk
bulk_extractor -o ./bulk_output disk.img

# strings — quick intel from raw disk
strings disk.img | grep -E "http|email|password|SELECT" | sort -u
```

## Phase 5 — Metadata Extraction

```bash
# Document metadata (author, creation dates, GPS coordinates in images)
exiftool extracted_document.pdf
exiftool -r /mnt/evidence/Documents/ > metadata-all.csv

# File timestamps (MAC times: Modified/Accessed/Changed)
stat file.txt
ls -la --time-style=full-iso file.txt
```

## Phase 6 — Timeline Reconstruction

```bash
# Create bodyfile from filesystem (Sleuth Kit)
fls -r -m / disk.img > bodyfile.txt

# Generate timeline from bodyfile
mactime -b bodyfile.txt -d > timeline.csv

# log2timeline / plaso — comprehensive timeline
log2timeline.py disk.img output.plaso
psort.py -o dynamic output.plaso "date > '2024-01-01' AND date < '2024-02-01'" > timeline.csv
```

## Windows Artifact Reference

| Artifact | Location | Forensic Value |
|----------|---------|---------------|
| Registry hives | `Windows/System32/config/` | Installed programs, user activity |
| Prefetch | `Windows/Prefetch/*.pf` | Program execution history |
| LNK files | `Users/<user>/AppData/Roaming/Microsoft/Windows/Recent/` | Recently accessed files |
| Event logs | `Windows/System32/winevt/Logs/` | Authentication, process creation |
| Browser history | `AppData/Local/<browser>/` | Web activity |
| NTDS.dit | `Windows/NTDS/ntds.dit` | Domain controller: all AD hashes |

## Evidence Handling Rules

- ALWAYS work on copies, never originals
- Mount everything read-only
- Document every action with timestamp and command run
- Preserve chain of custody documentation
- Keep evidence hashes to prove no tampering

## Key References

- NIST SP 800-86 — Guide to Integrating Forensic Techniques
- The Sleuth Kit documentation: `sleuthkit.org`
- SANS Digital Forensics cheat sheets
