#!/usr/bin/env python3
"""
Replace all remaining UTMStack agent/service name references in frontend source.
These are shell command strings shown in integration guides.

Mapping:
  C:\\Program Files\\UTMStack\\UTMStack Agent     -> C:\\Program Files\\NilaChakra\\NilaChakra Agent
  C:\\Program Files\\UTMStack\\UTMStack Collectors -> C:\\Program Files\\NilaChakra\\NilaChakra Collectors
  /opt/utmstack-linux-agent                        -> /opt/nilachakra-linux-agent
  /Library/LaunchDaemons/UTMStackAgent.plist       -> /Library/LaunchDaemons/NilaChakraAgent.plist
  /Library/LaunchDaemons/UTMStackUpdater.plist     -> /Library/LaunchDaemons/NilaChakraUpdater.plist
  UTMStackAgent        (service name)              -> NilaChakraAgent
  UTMStackWindowsLogsCollector                     -> NilaChakraWindowsLogsCollector
  UTMStackModulesLogsCollector                     -> NilaChakraModulesLogsCollector
  UTMStackCollector                                -> NilaChakraCollector
  UTMStackAS400Collector                           -> NilaChakraAS400Collector
  UTMStackUpdater                                  -> NilaChakraUpdater
  CloudTrail-UTMStack-DeliveryRole                 -> CloudTrail-NilaChakra-DeliveryRole
  utmstack_agent_service_windows_amd64.exe        -> nilachakra_agent_service_windows_amd64.exe
  utmstack_agent_service_windows_arm64.exe        -> nilachakra_agent_service_windows_arm64.exe
  utmstack_agent_service_linux_amd64              -> nilachakra_agent_service_linux_amd64
  utmstack_agent_service_linux_arm64              -> nilachakra_agent_service_linux_arm64
  utmstack_agent_service_macos                    -> nilachakra_agent_service_macos
  log-collector-config.json path stays the same (neutral name)
"""

import os
import re

SRC = "/Users/encryptshell/GIT/UTMStack-11/frontend/src"
EXTS = {".ts", ".html", ".scss", ".json"}

# Order matters — more specific first
REPLACEMENTS = [
    # Windows paths — program files
    ("C:\\\\Program Files\\\\UTMStack\\\\UTMStack Agent",
     "C:\\\\Program Files\\\\NilaChakra\\\\NilaChakra Agent"),
    ("C:\\\\Program Files\\\\UTMStack\\\\UTMStack Collectors",
     "C:\\\\Program Files\\\\NilaChakra\\\\NilaChakra Collectors"),
    ("C:\\Program Files\\UTMStack\\UTMStack Agent",
     "C:\\Program Files\\NilaChakra\\NilaChakra Agent"),
    ("C:\\Program Files\\UTMStack\\UTMStack Collectors",
     "C:\\Program Files\\NilaChakra\\NilaChakra Collectors"),
    # Linux agent path
    ("/opt/utmstack-linux-agent", "/opt/nilachakra-linux-agent"),
    # macOS plist files
    ("UTMStackAgent.plist", "NilaChakraAgent.plist"),
    ("UTMStackUpdater.plist", "NilaChakraUpdater.plist"),
    # Windows service names (in sc.exe / powershell commands)
    ("UTMStackWindowsLogsCollector", "NilaChakraWindowsLogsCollector"),
    ("UTMStackModulesLogsCollector", "NilaChakraModulesLogsCollector"),
    ("UTMStackAS400Collector", "NilaChakraAS400Collector"),
    ("UTMStackCollector", "NilaChakraCollector"),
    ("UTMStackUpdater", "NilaChakraUpdater"),
    ("UTMStackAgent", "NilaChakraAgent"),
    # Windows binary names
    ("utmstack_agent_service_windows_amd64.exe", "nilachakra_agent_service_windows_amd64.exe"),
    ("utmstack_agent_service_windows_arm64.exe", "nilachakra_agent_service_windows_arm64.exe"),
    ("utmstack_agent_service_linux_amd64", "nilachakra_agent_service_linux_amd64"),
    ("utmstack_agent_service_linux_arm64", "nilachakra_agent_service_linux_arm64"),
    ("utmstack_agent_service_macos", "nilachakra_agent_service_macos"),
    # AWS IAM role example name
    ("CloudTrail-UTMStack-DeliveryRole", "CloudTrail-NilaChakra-DeliveryRole"),
    # Remaining UTMStack\\NilaChakra Agent path inconsistency from previous partial rename
    ("UTMStack\\\\NilaChakra Agent", "NilaChakra\\\\NilaChakra Agent"),
    ("UTMStack\\NilaChakra Agent", "NilaChakra\\NilaChakra Agent"),
]

changed_files = []
total_replacements = 0

for root, dirs, files in os.walk(SRC):
    # Skip node_modules, dist, .angular
    dirs[:] = [d for d in dirs if d not in {"node_modules", "dist", ".angular", ".git"}]
    for fname in files:
        if not any(fname.endswith(ext) for ext in EXTS):
            continue
        fpath = os.path.join(root, fname)
        try:
            with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception:
            continue

        original = content
        count = 0
        for old, new in REPLACEMENTS:
            if old in content:
                n = content.count(old)
                content = content.replace(old, new)
                count += n

        if count > 0:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(content)
            rel = fpath.replace(SRC + "/", "")
            changed_files.append((rel, count))
            total_replacements += count
            print(f"  [{count:3d}] {rel}")

print(f"\nTotal: {total_replacements} replacements across {len(changed_files)} files")
