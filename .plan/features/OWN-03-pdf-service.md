# OWN-03: Replace Selenium PDF Service

**Priority:** Tier 6  
**Effort:** 3 days  
**Impact:** 🟡 Medium — Selenium-based PDF is fragile at scale

---

## Current Problem

`web-pdf/` uses Selenium + a real browser to render HTML and capture PDF.
- Fragile: browser crashes, timeouts
- Slow: 5-15 seconds per PDF
- Resource-heavy: full Chrome/Firefox process per request
- Java 11 + Spring Boot 2.7 (EOL)

---

## Recommended Solution: Node.js + Playwright

Replace with a lightweight Node.js service:
```
/pdf-service/          (new directory)
├── src/
│   ├── server.ts      (Express HTTP server)
│   ├── renderer.ts    (Playwright PDF rendering)
│   └── templates/     (HTML report templates)
├── Dockerfile
└── package.json
```

**Stack:** Node.js 22 + Express + Playwright (headless Chromium, no full browser)

### API (same as existing web-pdf interface):
```
POST /api/pdf/generate
Body: { url: string, options: { format, landscape, margin } }
Response: application/pdf binary

POST /api/pdf/from-html  
Body: { html: string, options: {...} }
Response: application/pdf binary
```

### Why Playwright over Puppeteer
- Official Microsoft maintained
- Better reliability and API
- Same Chromium under the hood

---

## Alternatively: Pure Java PDF (No Browser)

If you want to stay in Java:
- Use Apache PDFBox or iText (backend already has iText7)
- Build report templates as Java/HTML → iText → PDF
- No browser dependency at all
- Backend already generates some PDFs with `PdfGeneratorResource` + iText

**Recommendation:** Use the existing iText7 in the backend for report PDFs (already wired), and eliminate the web-pdf service entirely. The `PdfGeneratorResource` in the main backend should be capable of full report PDF generation without a separate service.

---

## 📋 SESSION PROMPT

```
I want to implement OWN-03: Replace the Selenium-based PDF service for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Current PDF service: /web-pdf/ (Java 11 + Spring Boot 2.7 + Selenium)
- Backend already has iText7 in pom.xml and PdfGeneratorResource.java

Investigation first:
1. Read /web-pdf/src/ to understand what it does and what endpoints it exposes
2. Read /backend/src/main/java/com/nilachakra/web/rest/util/PdfGeneratorResource.java
3. Read /backend/src/main/java/com/nilachakra/service/reports/ to understand report structure
4. Check /local-dev/docker-compose.yml for how web-pdf is connected

Decision: Can the main backend (PdfGeneratorResource + iText7) replace web-pdf entirely?
- If YES: 
  - Enhance PdfGeneratorResource to handle all PDF use cases web-pdf handles
  - Remove web-pdf from docker-compose
  - Update any frontend calls that go to web-pdf URL to use main backend instead
- If NO (browser rendering truly needed):
  - Create /pdf-service/ Node.js + Playwright service
  - Same API contract as current web-pdf
  - Replace in docker-compose

Output the decision + implementation.
```
