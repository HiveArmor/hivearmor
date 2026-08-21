---
name: mobile-audit
description: Mobile application security audit — OWASP MASVS/MASTG, iOS Keychain/Android EncryptedSharedPreferences, certificate pinning, IPC/deeplinks, Frida runtime instrumentation (own apps only), MobSF, adb backup extraction. Triggered by "mobile security audit", "iOS security", "Android security", "certificate pinning", "MASVS audit".
---

# Mobile Application Security Audit

OWASP MASVS (Mobile Application Security Verification Standard) / MASTG-aligned audit.

## Authorization Required

Binary analysis and runtime testing require authorization from the app owner. Framework applies to owned apps only.

## Seven Security Domains

### 1. Storage

```bash
# Android — check for sensitive data in plaintext storage
adb shell run-as <package> ls /data/data/<package>/

# Check SharedPreferences (often plaintext)
adb shell run-as <package> cat shared_prefs/<name>.xml

# Check SQLite databases
adb shell run-as <package> sqlite3 databases/<db>.db .dump

# Enable Android backup extraction (check if allowed)
adb backup -noapk -f backup.ab <package>
```

**Android best practices:**
- Use `EncryptedSharedPreferences` for sensitive data
- `android:allowBackup="false"` in manifest prevents `adb backup` extraction
- Sensitive data should not appear in `logcat` output

**iOS best practices:**
- Sensitive data in Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- Never store sensitive data in `NSUserDefaults` or plist files
- Use `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` for background tasks

### 2. Cryptography

```bash
# Decompile Android APK
jadx -d output/ app.apk

# Look for hardcoded keys
grep -rn "AES\|DES\|RC4\|MD5\|SHA1" output/
grep -rn "hardcoded\|secret.*=.*['\"]" output/
```

- AES-GCM or ChaCha20-Poly1305 (not AES-ECB or CBC without MAC)
- PBKDF2 ≥ 600,000 iterations or Argon2id for key derivation
- No hardcoded keys or IVs

### 3. Network / Certificate Pinning

```kotlin
// ✅ Certificate pinning with backup pin (Android OkHttp)
val certificatePinner = CertificatePinner.Builder()
    .add("api.target.com", "sha256/AAAA...")  // primary pin
    .add("api.target.com", "sha256/BBBB...")  // backup pin — prevents rotation outage
    .build()
```

"Pinning to a single cert means the next rotation breaks the app for all users."

Test pinning bypass:
```bash
# Frida script for SSL unpinning (own apps only)
frida -U -l ssl-unpinning.js -f com.target.app
```

### 4. Platform (IPC and Deep Links)

```xml
<!-- Android — review exported activities -->
<activity android:name=".AdminActivity" android:exported="true">
    <!-- Without permission check, any app can launch this -->
```

```bash
# Find all exported components
aapt dump xmltree app.apk AndroidManifest.xml | grep -A2 "exported=true"
```

- Custom URL schemes (`myapp://`) are weaker than HTTPS Universal/App Links
- Android App Links require `.well-known/assetlinks.json` verified by Google
- iOS Universal Links require `.well-known/apple-app-site-association`
- Deep link parameters must be validated — never trusted as authorized input

### 5. Code Quality

```bash
# Check for debug logging in release build
grep -rn "Log\.d\|Log\.v\|System\.out" output/
grep -rn "print(\|console\.log" ios-output/
```

### 6. Resilience (Optional — high-risk apps only)

Anti-tampering and anti-reverse-engineering:
- Root/jailbreak detection
- Debugger detection
- Code integrity checks

"Every resilience control will be bypassed by a determined attacker with physical device access." These are friction, not prevention.

Only required for high-risk apps (banking, healthcare, government). Not applicable to standard enterprise apps.

## Tools

| Tool | Purpose |
|------|---------|
| MobSF | Automated static/dynamic first-pass (both platforms) |
| jadx / apktool | Android decompilation |
| Frida + objection | Runtime instrumentation (own apps only) |
| idb | iOS app analysis |
| Hopper Disassembler / Ghidra | iOS binary analysis |

## Findings Template

```markdown
### [MASVS-STORAGE-1] Sensitive Data in SharedPreferences (Android)
**Severity:** High | **MASVS:** MASVS-STORAGE-1
**Description:** User authentication tokens stored in unencrypted SharedPreferences.
**Impact:** Physical device access or malicious backup extraction exposes credentials.
**Remediation:** Replace with `EncryptedSharedPreferences` using MasterKey.AES256_GCM.
```
