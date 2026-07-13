// UTMStack v11 Full UI Audit Script
// Uses Playwright to visit every active route and collect findings

import { chromium } from '/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const APP_URL = 'http://localhost:8880';
const SCREENSHOTS_DIR = '/Users/encryptshell/GIT/UTMStack-11/docs/ui-audit/screenshots';
const REPORT_PATH = '/Users/encryptshell/GIT/UTMStack-11/docs/ui-audit/UI_AUDIT_REPORT.md';

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const ROUTES = [
  { path: '/', name: 'login', title: 'Login Page' },
  { path: '/getting-started', name: 'getting-started', title: 'Getting Started' },
  { path: '/dashboard', name: 'dashboard-overview', title: 'Dashboard Overview' },
  { path: '/dashboard/view/1', name: 'dashboard-view-1', title: 'Dashboard View 1' },
  { path: '/data', name: 'data-alerts', title: 'Alert Management' },
  { path: '/discover', name: 'discover', title: 'Log Analyzer' },
  { path: '/data-sources', name: 'data-sources', title: 'Assets / Data Sources' },
  { path: '/integrations', name: 'integrations', title: 'Integrations' },
  { path: '/app-management', name: 'app-management', title: 'App Management' },
  { path: '/soar', name: 'soar', title: 'SOAR' },
  { path: '/incident', name: 'incident', title: 'Incidents' },
  { path: '/compliance', name: 'compliance', title: 'Compliance' },
  { path: '/data-parsing', name: 'data-parsing', title: 'Data Parsing' },
  { path: '/active-directory', name: 'active-directory', title: 'Active Directory' },
  { path: '/alerting-rules', name: 'alerting-rules', title: 'Alerting Rules' },
  { path: '/threat-intelligence', name: 'threat-intelligence', title: 'Threat Intelligence' },
  { path: '/creator', name: 'creator', title: 'Creator' },
  { path: '/variables', name: 'variables', title: 'Variables' },
  { path: '/management', name: 'management', title: 'Management (Admin)' },
  { path: '/profile', name: 'profile', title: 'Profile' },
];

const results = [];
const allConsoleErrors = {};
const allNetworkErrors = {};

async function auditPage(page, route) {
  const findings = {
    route: route.path,
    name: route.name,
    title: null,
    h1: null,
    finalUrl: null,
    redirected: false,
    screenshot: null,
    consoleErrors: [],
    consoleWarnings: [],
    networkErrors: [],
    api404s: [],
    brokenImages: [],
    overflowElements: [],
    disabledButtons: [],
    emptyStates: [],
    stuckSpinners: [],
    hasDateFilter: false,
    hasSearchInput: false,
    searchInputInteractive: false,
    hasBreadcrumb: false,
    breadcrumbText: null,
    hasNavigation: false,
    navLinks: [],
    metricCards: [],
    issues: [],
    pageLoadOk: false,
  };

  const consoleErrors = [];
  const consoleWarnings = [];
  const networkErrors = [];
  const api404s = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });

  page.on('response', (resp) => {
    if (resp.status() >= 400) {
      const url = resp.url();
      if (url.includes('/api/')) {
        if (resp.status() === 404) api404s.push(`404: ${url}`);
        else networkErrors.push(`HTTP ${resp.status()}: ${url}`);
      }
    }
  });

  try {
    await page.goto(APP_URL + route.path, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    findings.finalUrl = page.url();
    findings.redirected = !findings.finalUrl.includes(route.path);
    findings.pageLoadOk = true;
  } catch (e) {
    findings.issues.push({ severity: 'CRITICAL', issue: `Page failed to load: ${e.message}` });
    findings.pageLoadOk = false;
  }

  findings.consoleErrors = [...consoleErrors];
  findings.consoleWarnings = [...consoleWarnings];
  findings.networkErrors = [...networkErrors];
  findings.api404s = [...api404s];

  try {
    findings.title = await page.title();
  } catch (e) {}

  try {
    const h1 = await page.$('h1');
    if (h1) findings.h1 = await h1.innerText().catch(() => null);
  } catch (e) {}

  // Screenshot
  try {
    const screenshotPath = join(SCREENSHOTS_DIR, `${route.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    findings.screenshot = screenshotPath;
  } catch (e) {
    findings.issues.push({ severity: 'MINOR', issue: `Screenshot failed: ${e.message}` });
  }

  return findings;
}

async function deepAuditPage(page, findings, route) {
  if (!findings.pageLoadOk) return findings;

  // Check for broken images
  try {
    const brokenImgs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).filter(img => {
        return img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:');
      }).map(img => img.src);
    });
    findings.brokenImages = brokenImgs;
    if (brokenImgs.length > 0) {
      findings.issues.push({ severity: 'MAJOR', issue: `${brokenImgs.length} broken image(s): ${brokenImgs.slice(0,3).join(', ')}` });
    }
  } catch (e) {}

  // Check for overflow elements
  try {
    const overflows = await page.evaluate(() => {
      const vw = window.innerWidth;
      return Array.from(document.querySelectorAll('*')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.right > vw + 5 && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE';
      }).slice(0, 5).map(el => `${el.tagName}${el.className ? '.' + el.className.split(' ').join('.') : ''}`);
    });
    findings.overflowElements = overflows;
    if (overflows.length > 0) {
      findings.issues.push({ severity: 'MINOR', issue: `Overflow detected: ${overflows.slice(0,3).join(', ')}` });
    }
  } catch (e) {}

  // Check for disabled buttons
  try {
    const disabledBtns = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button[disabled], button.disabled, button[aria-disabled="true"]'))
        .slice(0, 10)
        .map(b => b.innerText.trim() || b.getAttribute('aria-label') || b.className);
    });
    findings.disabledButtons = disabledBtns;
  } catch (e) {}

  // Check for empty states
  try {
    const emptyStates = await page.evaluate(() => {
      const selectors = [
        '.empty-state', '.no-data', '.no-results', '[class*="empty"]',
        '.ut-empty', 'app-utm-no-result', 'app-no-data',
        '[class*="no-data"]', '[class*="no-result"]'
      ];
      return selectors.flatMap(s => Array.from(document.querySelectorAll(s)))
        .slice(0, 5).map(el => el.innerText.trim().substring(0, 80));
    });
    findings.emptyStates = emptyStates.filter(Boolean);
  } catch (e) {}

  // Check for stuck spinners (spinners still visible after wait)
  try {
    const spinners = await page.evaluate(() => {
      const selectors = [
        '.spinner', '.loading', '[class*="spinner"]', '[class*="loading"]',
        'app-utm-spinner', 'mat-spinner', '.spin', 'i.icon-spinner'
      ];
      return selectors.flatMap(s => Array.from(document.querySelectorAll(s)))
        .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .slice(0, 3).map(el => el.className);
    });
    findings.stuckSpinners = spinners;
    if (spinners.length > 0) {
      findings.issues.push({ severity: 'MAJOR', issue: `Stuck spinner(s): ${spinners.join(', ')}` });
    }
  } catch (e) {}

  // Check for date/time filter
  try {
    findings.hasDateFilter = await page.evaluate(() => {
      const dateSelectors = [
        'app-utm-date-range', 'app-date-picker', '[class*="date-range"]',
        '[class*="time-range"]', 'input[type="date"]', '.date-filter',
        'app-utm-time-filter', '[placeholder*="date" i]', '[placeholder*="time" i]'
      ];
      return dateSelectors.some(s => document.querySelector(s) !== null);
    });
  } catch (e) {}

  // Check search inputs
  try {
    const searchInputs = await page.$$('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i], .search-input input, app-utm-search input');
    findings.hasSearchInput = searchInputs.length > 0;
    if (searchInputs.length > 0) {
      try {
        await searchInputs[0].click();
        await searchInputs[0].type('test', { delay: 30 });
        const val = await searchInputs[0].inputValue();
        findings.searchInputInteractive = val.includes('test');
        await searchInputs[0].fill(''); // clear
      } catch (e) {}
    }
  } catch (e) {}

  // Check breadcrumb
  try {
    const bc = await page.$('app-utm-breadcrumb, .breadcrumb, [aria-label="breadcrumb"], nav.breadcrumb');
    if (bc) {
      findings.hasBreadcrumb = true;
      findings.breadcrumbText = (await bc.innerText().catch(() => null));
    }
  } catch (e) {}

  // Check navigation
  try {
    const nav = await page.$('app-main-menu, .sidebar, nav.sidenav, [class*="sidebar"], [class*="main-menu"]');
    findings.hasNavigation = nav !== null;
    if (nav) {
      const links = await page.$$eval('a[routerlink], .sidebar a, [class*="sidebar"] a', els => 
        els.slice(0, 20).map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') || a.getAttribute('routerlink') }))
          .filter(l => l.text)
      );
      findings.navLinks = links;
    }
  } catch (e) {}

  // Check metric cards (numbers showing?)
  try {
    const metrics = await page.evaluate(() => {
      const cardSelectors = [
        '.metric-card', '.stat-card', '.card-metric', '[class*="metric"]',
        'app-utm-stat-widget', '.dashboard-card', '.kpi-card',
        '.count-card', '[class*="count"]'
      ];
      return cardSelectors.flatMap(s => Array.from(document.querySelectorAll(s)))
        .slice(0, 10).map(el => {
          const text = el.innerText.trim();
          const nums = text.match(/\d+/);
          return { text: text.substring(0, 60), hasNumber: nums !== null };
        });
    });
    findings.metricCards = metrics;
  } catch (e) {}

  // Identify issues from console errors
  if (findings.consoleErrors.length > 0) {
    findings.issues.push({ severity: 'MAJOR', issue: `${findings.consoleErrors.length} JS console error(s): ${findings.consoleErrors.slice(0,2).join(' | ')}` });
  }
  if (findings.api404s.length > 0) {
    findings.issues.push({ severity: 'MAJOR', issue: `${findings.api404s.length} API 404(s): ${findings.api404s.slice(0,3).join(', ')}` });
  }
  if (findings.networkErrors.length > 0) {
    findings.issues.push({ severity: 'MAJOR', issue: `${findings.networkErrors.length} network error(s): ${findings.networkErrors.slice(0,3).join(', ')}` });
  }

  return findings;
}

async function login(page) {
  console.log('Logging in...');
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);

  // Try admin / admin@123
  try {
    const userField = await page.$('input[type="text"], input[name="username"], input[id="username"]');
    const passField = await page.$('input[type="password"]');
    if (userField && passField) {
      await userField.fill('admin');
      await passField.fill('admin@123');
      const submitBtn = await page.$('button[type="submit"], form button');
      if (submitBtn) await submitBtn.click();
      await page.waitForTimeout(3000);

      // Check if we're logged in (not on login page anymore)
      const url = page.url();
      if (!url.includes('login') && !url.endsWith('/')) {
        console.log('Logged in with admin/admin@123');
        return true;
      }
      // Check for error message indicating wrong password
      const errEl = await page.$('.alert-danger, .error-message, [class*="error"]');
      if (errEl) {
        console.log('Password admin@123 failed, trying admin/admin...');
        await userField.fill('admin');
        await passField.fill('admin');
        if (submitBtn) await submitBtn.click();
        await page.waitForTimeout(3000);
        const url2 = page.url();
        if (!url2.includes('login') && !url2.endsWith('/')) {
          console.log('Logged in with admin/admin');
          return true;
        }
      }
    }
  } catch (e) {
    console.error('Login error:', e.message);
  }

  // Check if we navigated away (success redirect)
  const finalUrl = page.url();
  if (finalUrl.includes('/dashboard') || finalUrl.includes('/getting-started')) {
    console.log('Login succeeded, redirected to:', finalUrl);
    return true;
  }
  console.log('Login may have failed, current URL:', finalUrl);
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Audit the login page first
  console.log('\n--- Auditing: / (Login) ---');
  const loginFindings = await auditPage(page, ROUTES[0]);
  await deepAuditPage(page, loginFindings, ROUTES[0]);

  // Additional login page checks
  try {
    const hasUserField = await page.$('input[type="text"], input[name="username"]') !== null;
    const hasPassField = await page.$('input[type="password"]') !== null;
    const hasSubmitBtn = await page.$('button[type="submit"], form button') !== null;
    if (!hasUserField) loginFindings.issues.push({ severity: 'CRITICAL', issue: 'No username input field found' });
    if (!hasPassField) loginFindings.issues.push({ severity: 'CRITICAL', issue: 'No password input field found' });
    if (!hasSubmitBtn) loginFindings.issues.push({ severity: 'CRITICAL', issue: 'No submit button found' });
  } catch (e) {}

  results.push(loginFindings);
  console.log(`Login page: ${loginFindings.issues.length} issues`);

  // Login
  const loggedIn = await login(page);
  if (!loggedIn) {
    console.error('Could not log in! Will still attempt to audit pages.');
  }
  await page.waitForTimeout(2000);

  // Audit remaining routes
  for (const route of ROUTES.slice(1)) {
    console.log(`\n--- Auditing: ${route.path} ---`);
    // Detach previous listeners by creating a fresh page for each route
    const newPage = await context.newPage();
    const findings = await auditPage(newPage, route);
    await deepAuditPage(newPage, findings, route);
    results.push(findings);
    console.log(`  Issues: ${findings.issues.length}, Errors: ${findings.consoleErrors.length}, 404s: ${findings.api404s.length}`);
    await newPage.close();
  }

  await browser.close();

  // Save raw results
  writeFileSync('/Users/encryptshell/GIT/UTMStack-11/docs/ui-audit/audit-raw.json',
    JSON.stringify(results, null, 2), 'utf8');
  console.log('\nRaw results saved.');

  generateReport(results);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

function generateReport(results) {
  const now = new Date().toISOString().split('T')[0];
  let criticalCount = 0, majorCount = 0, minorCount = 0;
  const criticalIssues = [], majorIssues = [], minorIssues = [];

  for (const r of results) {
    for (const issue of r.issues) {
      const entry = { route: r.route, ...issue };
      if (issue.severity === 'CRITICAL') { criticalCount++; criticalIssues.push(entry); }
      else if (issue.severity === 'MAJOR') { majorCount++; majorIssues.push(entry); }
      else { minorCount++; minorIssues.push(entry); }
    }
  }

  let report = `# UTMStack v11 Frontend UI Audit Report
**Date**: ${now}
**App URL**: http://localhost:8880
**Angular Version**: 17.3.12
**Pages Audited**: ${results.length}

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total pages audited | ${results.length} |
| Pages that loaded successfully | ${results.filter(r => r.pageLoadOk).length} |
| Pages that redirected | ${results.filter(r => r.redirected).length} |
| 🔴 Critical issues | ${criticalCount} |
| 🟠 Major issues | ${majorCount} |
| 🟡 Minor issues | ${minorCount} |

### Key Observations

- Login credentials tested: admin/admin@123
- Backend services: eventprocessor and agentmanager are unhealthy in local dev — some data pages will show empty states (expected)
- Audit scope: UI structure, layout, navigation, component rendering

---

## Issues by Severity

### 🔴 CRITICAL (Blocks core workflow)

${criticalIssues.length === 0 ? '_No critical issues found._' : criticalIssues.map(i =>
  `- **${i.route}**: ${i.issue}`
).join('\n')}

### 🟠 MAJOR (Feature broken/unusable)

${majorIssues.length === 0 ? '_No major issues found._' : majorIssues.map(i =>
  `- **${i.route}**: ${i.issue}`
).join('\n')}

### 🟡 MINOR (Cosmetic / alignment / UX)

${minorIssues.length === 0 ? '_No minor issues found._' : minorIssues.map(i =>
  `- **${i.route}**: ${i.issue}`
).join('\n')}

---

## Page-by-Page Findings

`;

  for (const r of results) {
    report += `### \`${r.route}\` — ${r.name}\n\n`;
    report += `| Field | Value |\n|-------|-------|\n`;
    report += `| Page loaded | ${r.pageLoadOk ? '✅ Yes' : '❌ No'} |\n`;
    report += `| Final URL | \`${r.finalUrl || 'N/A'}\` |\n`;
    if (r.redirected) report += `| Redirected | ⚠️ Yes (from \`${r.route}\`) |\n`;
    report += `| Page title | ${r.title || '_none_'} |\n`;
    report += `| H1 | ${r.h1 || '_none_'} |\n`;
    report += `| Sidebar / nav | ${r.hasNavigation ? '✅ Present' : '⚠️ Not found'} |\n`;
    report += `| Breadcrumb | ${r.hasBreadcrumb ? `✅ \`${(r.breadcrumbText || '').replace(/\n/g, ' > ').substring(0, 60)}\`` : '— Not present'} |\n`;
    report += `| Date/time filter | ${r.hasDateFilter ? '✅ Present' : '— Not found'} |\n`;
    report += `| Search input | ${r.hasSearchInput ? (r.searchInputInteractive ? '✅ Present & interactive' : '⚠️ Present but not interactive') : '— Not found'} |\n`;
    report += `| Broken images | ${r.brokenImages.length > 0 ? `⚠️ ${r.brokenImages.length}: ${r.brokenImages.slice(0,2).join(', ')}` : '✅ None'} |\n`;
    report += `| Stuck spinners | ${r.stuckSpinners.length > 0 ? `⚠️ ${r.stuckSpinners.length} found` : '✅ None'} |\n`;
    report += `| Disabled buttons | ${r.disabledButtons.length > 0 ? r.disabledButtons.slice(0,3).join(', ') : '—'} |\n`;
    report += `| Console errors | ${r.consoleErrors.length > 0 ? `❌ ${r.consoleErrors.length}` : '✅ None'} |\n`;
    report += `| Console warnings | ${r.consoleWarnings.length > 0 ? `⚠️ ${r.consoleWarnings.length}` : '✅ None'} |\n`;
    report += `| API 404s | ${r.api404s.length > 0 ? `❌ ${r.api404s.length}` : '✅ None'} |\n`;
    report += `| Other network errors | ${r.networkErrors.length > 0 ? `❌ ${r.networkErrors.length}` : '✅ None'} |\n`;
    report += `| Screenshot | \`screenshots/${r.name}.png\` |\n`;
    report += '\n';

    if (r.consoleErrors.length > 0) {
      report += `**Console Errors:**\n\`\`\`\n${r.consoleErrors.slice(0, 5).join('\n')}\n\`\`\`\n\n`;
    }
    if (r.consoleWarnings.length > 0) {
      report += `**Console Warnings (first 3):**\n\`\`\`\n${r.consoleWarnings.slice(0, 3).join('\n')}\n\`\`\`\n\n`;
    }
    if (r.api404s.length > 0) {
      report += `**API 404s:**\n${r.api404s.map(e => `- \`${e}\``).join('\n')}\n\n`;
    }
    if (r.networkErrors.length > 0) {
      report += `**Network Errors (non-404):**\n${r.networkErrors.slice(0,5).map(e => `- \`${e}\``).join('\n')}\n\n`;
    }
    if (r.emptyStates.length > 0) {
      report += `**Empty States Detected:**\n${r.emptyStates.map(e => `- "${e}"`).join('\n')}\n\n`;
    }
    if (r.metricCards.length > 0) {
      report += `**Metric Cards:**\n${r.metricCards.slice(0,5).map(c => `- ${c.hasNumber ? '✅' : '⬜'} "${c.text.substring(0,50)}"`).join('\n')}\n\n`;
    }
    if (r.issues.length > 0) {
      report += `**Issues Found on This Page:**\n`;
      for (const issue of r.issues) {
        const icon = issue.severity === 'CRITICAL' ? '🔴' : issue.severity === 'MAJOR' ? '🟠' : '🟡';
        report += `- ${icon} \`${issue.severity}\`: ${issue.issue}\n`;
      }
      report += '\n';
    }
    report += '---\n\n';
  }

  report += `## Appendix: Navigation Links Observed\n\n`;
  const navResult = results.find(r => r.navLinks.length > 0);
  if (navResult) {
    report += navResult.navLinks.slice(0, 30).map(l => `- ${l.text} → \`${l.href}\``).join('\n');
  } else {
    report += '_No navigation links collected._';
  }

  report += `\n\n---\n*Generated by UTMStack Automated UI Audit — ${now}*\n`;

  writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`\n✅ Report saved to: ${REPORT_PATH}`);
  console.log(`📊 Summary: ${criticalCount} critical, ${majorCount} major, ${minorCount} minor issues`);
}
