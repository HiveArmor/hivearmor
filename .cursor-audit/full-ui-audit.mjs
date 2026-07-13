/**
 * Full UI Audit Script — UTMStack v11
 * Logs in, visits every route, captures screenshots + console errors + broken elements
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8880';
const USERNAME = 'admin';
const PASSWORD = 'localdev123!';
const SCREENSHOT_DIR = '/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/screenshots';
const REPORT_FILE = '/Users/encryptshell/GIT/UTMStack-11/.cursor-audit/audit-report.json';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const auditReport = {
  timestamp: new Date().toISOString(),
  pages: [],
  globalIssues: []
};

// ── helpers ──────────────────────────────────────────────────────────────────

function slug(label) {
  return label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

async function screenshot(label) {
  const file = path.join(SCREENSHOT_DIR, slug(label) + '.png');
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function capturePageAudit(label, url, actions) {
  const errors = [];
  const warnings = [];
  const networkErrors = [];
  const apiCalls = [];

  const onConsole = msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warn') warnings.push(msg.text());
  };
  const onPageError = err => errors.push('PAGEERROR: ' + err.message);
  const onResponse = resp => {
    const u = resp.url();
    const s = resp.status();
    if (u.includes('/api/')) {
      apiCalls.push(`${s} ${resp.request().method()} ${u.replace(BASE_URL, '')}`);
      if (s >= 400) networkErrors.push(`HTTP ${s}: ${u.replace(BASE_URL, '')}`);
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  console.log(`\n[AUDIT] ${label} → ${url}`);

  try {
    await page.goto(BASE_URL + url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    errors.push('NAV_ERROR: ' + e.message.slice(0, 200));
  }

  // run page-specific probes
  const findings = [];
  if (actions) {
    try {
      const result = await actions(page, findings);
    } catch (e) {
      findings.push({ severity: 'error', type: 'action_error', detail: e.message.slice(0, 300) });
    }
  }

  // generic checks on every page
  const genericFindings = await page.evaluate(() => {
    const issues = [];

    // broken images
    const imgs = Array.from(document.querySelectorAll('img'));
    imgs.forEach(img => {
      if (!img.complete || img.naturalWidth === 0) {
        issues.push({ severity: 'error', type: 'broken_image', detail: img.src });
      }
    });

    // buttons with no text / aria-label
    const btns = Array.from(document.querySelectorAll('button'));
    btns.forEach(btn => {
      const text = (btn.textContent || '').trim();
      const aria = btn.getAttribute('aria-label') || '';
      const title = btn.getAttribute('title') || '';
      if (!text && !aria && !title) {
        issues.push({ severity: 'warn', type: 'empty_button', detail: btn.outerHTML.slice(0, 120) });
      }
    });

    // inputs with no label
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
    inputs.forEach(inp => {
      const id = inp.id;
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const aria = inp.getAttribute('aria-label') || inp.getAttribute('placeholder') || '';
      if (!hasLabel && !aria) {
        issues.push({ severity: 'warn', type: 'unlabelled_input', detail: inp.outerHTML.slice(0, 120) });
      }
    });

    // overflow / horizontal scroll
    const bodyWidth = document.body.scrollWidth;
    const viewWidth = window.innerWidth;
    if (bodyWidth > viewWidth + 10) {
      issues.push({ severity: 'warn', type: 'horizontal_overflow', detail: `body ${bodyWidth}px > viewport ${viewWidth}px` });
    }

    // empty table bodies that likely should have data
    const tables = Array.from(document.querySelectorAll('table'));
    tables.forEach(t => {
      const tbody = t.querySelector('tbody');
      if (tbody && tbody.children.length === 0) {
        issues.push({ severity: 'info', type: 'empty_table', detail: 'Table has empty tbody — may be loading issue or no data' });
      }
    });

    // spinner still visible after load
    const spinner = document.querySelector('ngx-spinner .overlay, .ngx-spinner-overlay');
    if (spinner && spinner.style.display !== 'none') {
      issues.push({ severity: 'error', type: 'spinner_stuck', detail: 'ngx-spinner still visible after page settled' });
    }

    // z-index / modal stuck open
    const modals = Array.from(document.querySelectorAll('.modal.show, ngb-modal-window'));
    if (modals.length > 0) {
      issues.push({ severity: 'warn', type: 'modal_open', detail: `${modals.length} modal(s) open on page load` });
    }

    return issues;
  });

  const screenshotPath = await screenshot(label);

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);

  const entry = {
    label,
    url,
    screenshotPath,
    consoleErrors: errors,
    consoleWarnings: warnings.slice(0, 10),
    networkErrors,
    apiCalls: apiCalls.slice(0, 20),
    findings: [...findings, ...genericFindings]
  };

  auditReport.pages.push(entry);

  const issueCount = errors.length + networkErrors.length + findings.filter(f => f.severity === 'error').length;
  console.log(`  → ${issueCount} errors, ${findings.length + genericFindings.length} findings, ${apiCalls.length} API calls`);

  return entry;
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────

console.log('\n=== STEP 1: Login ===');
await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForSelector('input[type="password"]', { timeout: 15000 });

// screenshot login page first
await screenshot('00_login_page');

// check login form elements
const loginFindings = await page.evaluate(() => {
  const issues = [];
  const usernameInput = document.querySelector('input[name="username"], input[type="text"], input#username');
  const passwordInput = document.querySelector('input[type="password"]');
  const loginBtn = document.querySelector('button[type="submit"], .btn-login, button.btn-primary');
  const logo = document.querySelector('img[src*="logo"], img[alt*="UTM"]');

  if (!usernameInput) issues.push({ severity: 'error', type: 'missing_element', detail: 'No username input found on login page' });
  if (!passwordInput) issues.push({ severity: 'error', type: 'missing_element', detail: 'No password input found on login page' });
  if (!loginBtn) issues.push({ severity: 'warn', type: 'missing_element', detail: 'No submit button found on login page' });
  if (!logo) issues.push({ severity: 'warn', type: 'missing_logo', detail: 'No logo image found on login page' });
  return issues;
});

auditReport.pages.push({ label: '00_Login', url: '/', screenshotPath: SCREENSHOT_DIR + '/00_login_page.png', findings: loginFindings, consoleErrors: [], networkErrors: [] });

// do the login
try {
  const usernameField = await page.$('input[type="email"]') ||
                        await page.$('input[placeholder*="username" i]') ||
                        await page.$('input[placeholder*="Username"]') ||
                        await page.$('input[name="username"]') ||
                        await page.$('input[type="text"]') ||
                        await page.$('#username');
  await usernameField.fill(USERNAME);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.toString().includes('login') && !u.toString().includes('totp'), { timeout: 15000 });
  console.log('  ✅ Login successful, landed at:', page.url());
} catch (e) {
  console.log('  ❌ Login FAILED:', e.message);
  auditReport.globalIssues.push({ severity: 'critical', type: 'login_failed', detail: e.message });
  await browser.close();
  fs.writeFileSync(REPORT_FILE, JSON.stringify(auditReport, null, 2));
  process.exit(1);
}

await page.waitForTimeout(3000);

// ── ROUTE AUDIT TABLE ─────────────────────────────────────────────────────────

const routes = [
  // Dashboard
  { label: '01_Dashboard_Overview',        url: '/dashboard',                    actions: dashboardOverviewChecks },
  { label: '02_Dashboard_Custom',          url: '/dashboard/view/1',             actions: dashboardCustomChecks },
  // Alerts / Data
  { label: '03_Alerts_List',               url: '/data/alerts',                  actions: alertListChecks },
  { label: '04_Alert_Management',          url: '/data',                         actions: null },
  // Log Analyzer / Discover
  { label: '05_Discover_Log_Analyzer',     url: '/discover',                     actions: discoverChecks },
  // Incidents
  { label: '06_Incidents',                 url: '/incident',                     actions: incidentChecks },
  // SOAR
  { label: '07_SOAR_Home',                 url: '/soar',                         actions: soarChecks },
  { label: '08_SOAR_Automations',          url: '/soar/automations',             actions: null },
  { label: '09_SOAR_Playbooks',            url: '/soar/playbooks',               actions: null },
  // Compliance
  { label: '10_Compliance',               url: '/compliance',                    actions: complianceChecks },
  // Alerting Rules
  { label: '11_Alerting_Rules',           url: '/alerting-rules',                actions: null },
  // Data Parsing
  { label: '12_Data_Parsing',             url: '/data-parsing',                  actions: null },
  // Integrations
  { label: '13_Integrations',             url: '/integrations',                  actions: integrationsChecks },
  // App Management
  { label: '14_App_Management',           url: '/app-management',               actions: null },
  { label: '15_App_Config',              url: '/app-management/config',          actions: null },
  { label: '16_App_Api_Doc',             url: '/app-management/api',             actions: null },
  // Data Sources
  { label: '17_Data_Sources',            url: '/data-sources',                   actions: dataSourceChecks },
  // Threat Intelligence
  { label: '18_Threat_Intelligence',     url: '/threat-intelligence',            actions: null },
  // Active Directory
  { label: '19_Active_Directory',        url: '/active-directory',              actions: null },
  // Chart / Dashboard Creator
  { label: '20_Chart_Creator',           url: '/creator',                        actions: chartCreatorChecks },
  // Admin / Management
  { label: '21_Admin_Users',             url: '/management/users',              actions: adminChecks },
  { label: '22_Admin_Api_Keys',          url: '/management/api-keys',           actions: null },
  // Profile
  { label: '23_Profile',                 url: '/profile',                        actions: profileChecks },
  // Automation Variables
  { label: '24_Variables',               url: '/variables',                      actions: null },
  // Getting Started
  { label: '25_Getting_Started',         url: '/getting-started',               actions: null },
];

// ── PAGE-SPECIFIC CHECK FUNCTIONS ─────────────────────────────────────────────

async function dashboardOverviewChecks(page, findings) {
  // Check KPI cards
  const kpiCards = await page.$$('.kpi-card, app-kpi, [class*="kpi"]');
  if (kpiCards.length === 0) findings.push({ severity: 'warn', type: 'missing_kpi_cards', detail: 'No KPI cards found on dashboard overview' });
  else findings.push({ severity: 'info', type: 'kpi_cards_count', detail: `Found ${kpiCards.length} KPI card elements` });

  // Check if charts render
  const charts = await page.$$('canvas, .echarts, app-utm-echarts, echarts-for-react, [echarts]');
  if (charts.length === 0) findings.push({ severity: 'warn', type: 'no_charts', detail: 'No chart canvases found on dashboard' });
  else findings.push({ severity: 'info', type: 'chart_count', detail: `Found ${charts.length} chart elements` });

  // Check time filter
  const timeFilter = await page.$('app-date-range, app-time-filter, [class*="time-filter"], [class*="date-range"]');
  if (!timeFilter) findings.push({ severity: 'warn', type: 'no_time_filter', detail: 'No date/time filter found on dashboard' });

  // Check top nav
  const navbar = await page.$('app-header, .navbar, nav[class*="navbar"]');
  if (!navbar) findings.push({ severity: 'error', type: 'no_navbar', detail: 'No navigation header found' });

  // Check sidebar
  const sidebar = await page.$('app-utm-left-nav, .left-nav, .sidebar, [class*="sidebar"]');
  if (!sidebar) findings.push({ severity: 'error', type: 'no_sidebar', detail: 'No left sidebar found' });

  // Overflow check
  const overflow = await page.evaluate(() => ({
    bodyScroll: document.body.scrollWidth > window.innerWidth + 10,
    mainScroll: (document.querySelector('.app-content') || {scrollWidth: 0}).scrollWidth > window.innerWidth + 10
  }));
  if (overflow.bodyScroll) findings.push({ severity: 'warn', type: 'horizontal_overflow', detail: 'Body has horizontal scroll on dashboard' });
}

async function dashboardCustomChecks(page, findings) {
  await page.waitForTimeout(3000);
  const gridItems = await page.$$('gridster-item, .gridster-item');
  if (gridItems.length === 0) findings.push({ severity: 'warn', type: 'empty_dashboard', detail: 'No dashboard widgets found (may be no configured dashboard)' });
  else findings.push({ severity: 'info', type: 'dashboard_widgets', detail: `${gridItems.length} gridster widgets found` });

  const addBtn = await page.$('button[title*="add"], button[title*="Add"], .btn-add');
  if (!addBtn) findings.push({ severity: 'info', type: 'no_add_widget_btn', detail: 'No add widget button visible' });
}

async function alertListChecks(page, findings) {
  await page.waitForTimeout(3000);

  const table = await page.$('table, .table, app-utm-dynamic-table');
  if (!table) findings.push({ severity: 'warn', type: 'no_alert_table', detail: 'No alert table found' });

  const filters = await page.$$('[class*="filter"], app-elastic-filter, app-date-range');
  findings.push({ severity: 'info', type: 'filter_count', detail: `${filters.length} filter elements found` });

  // check severity badges
  const badges = await page.$$('.badge, [class*="sev-"], [class*="severity"]');
  findings.push({ severity: 'info', type: 'severity_badges', detail: `${badges.length} severity badge elements` });

  // check search box
  const search = await page.$('input[type="search"], input[placeholder*="search" i], app-utm-search-input');
  if (!search) findings.push({ severity: 'warn', type: 'no_search_box', detail: 'No search input found on alerts page' });

  // status filter buttons
  const statusBtns = await page.$$('[class*="status"], .btn-group button, [class*="filter-btn"]');
  findings.push({ severity: 'info', type: 'status_filters', detail: `${statusBtns.length} status filter elements` });

  // pagination
  const pagination = await page.$('ngb-pagination, .pagination, [class*="pagination"]');
  if (!pagination) findings.push({ severity: 'warn', type: 'no_pagination', detail: 'No pagination found on alerts list' });
}

async function discoverChecks(page, findings) {
  await page.waitForTimeout(4000);

  const searchBar = await page.$('input[class*="search"], textarea[class*="search"], .search-input, [placeholder*="query" i]');
  if (!searchBar) findings.push({ severity: 'warn', type: 'no_search_bar', detail: 'No query/search bar found in log analyzer' });

  const timeFilter = await page.$('app-date-range, app-time-filter, [class*="date"]');
  if (!timeFilter) findings.push({ severity: 'warn', type: 'no_time_filter', detail: 'No time filter in log analyzer' });

  const resultsArea = await page.$('[class*="results"], [class*="hits"], .log-results, table');
  if (!resultsArea) findings.push({ severity: 'warn', type: 'no_results_area', detail: 'No results area in log analyzer' });
}

async function incidentChecks(page, findings) {
  await page.waitForTimeout(3000);
  const cards = await page.$$('[class*="incident-card"], .card, app-incident');
  findings.push({ severity: 'info', type: 'incident_elements', detail: `${cards.length} incident card elements` });

  const createBtn = await page.$('button[title*="create" i], button[title*="new" i], .btn-create');
  if (!createBtn) findings.push({ severity: 'warn', type: 'no_create_btn', detail: 'No create incident button visible' });
}

async function soarChecks(page, findings) {
  await page.waitForTimeout(3000);
  const soarItems = await page.$$('[class*="soar"], [class*="playbook"], [class*="automation"]');
  findings.push({ severity: 'info', type: 'soar_elements', detail: `${soarItems.length} SOAR elements` });
}

async function complianceChecks(page, findings) {
  await page.waitForTimeout(3000);
  const charts = await page.$$('canvas, [echarts]');
  findings.push({ severity: 'info', type: 'compliance_charts', detail: `${charts.length} charts on compliance page` });
  const standards = await page.$$('[class*="standard"], [class*="compliance"]');
  findings.push({ severity: 'info', type: 'compliance_standards', detail: `${standards.length} compliance standard elements` });
}

async function integrationsChecks(page, findings) {
  await page.waitForTimeout(3000);
  const cards = await page.$$('[class*="integration"], .card, app-module-card, app-utm-module');
  findings.push({ severity: 'info', type: 'integration_cards', detail: `${cards.length} integration cards` });
  if (cards.length === 0) findings.push({ severity: 'warn', type: 'no_integrations', detail: 'No integration cards rendered' });
}

async function dataSourceChecks(page, findings) {
  await page.waitForTimeout(3000);
  const table = await page.$('table, app-utm-dynamic-table');
  if (!table) findings.push({ severity: 'warn', type: 'no_datasource_table', detail: 'No data source table found' });

  const search = await page.$('input[type="search"], input[placeholder*="search" i]');
  if (!search) findings.push({ severity: 'warn', type: 'no_search', detail: 'No search box on data sources' });
}

async function chartCreatorChecks(page, findings) {
  await page.waitForTimeout(4000);
  const builder = await page.$('[class*="builder"], [class*="chart-type"], app-chart-builder');
  if (!builder) findings.push({ severity: 'warn', type: 'no_chart_builder', detail: 'Chart builder UI not found' });

  const chartTypes = await page.$$('[class*="chart-type"], [class*="vis-type"]');
  findings.push({ severity: 'info', type: 'chart_type_options', detail: `${chartTypes.length} chart type options` });
}

async function adminChecks(page, findings) {
  await page.waitForTimeout(3000);
  const table = await page.$('table, app-utm-dynamic-table');
  if (!table) findings.push({ severity: 'warn', type: 'no_user_table', detail: 'No user table found in admin' });

  const createBtn = await page.$('button[title*="create" i], button[title*="new" i], .btn-create, button.btn-primary');
  if (!createBtn) findings.push({ severity: 'warn', type: 'no_create_user_btn', detail: 'No create user button found' });
}

async function profileChecks(page, findings) {
  await page.waitForTimeout(3000);
  const form = await page.$('form, [class*="profile"]');
  if (!form) findings.push({ severity: 'warn', type: 'no_profile_form', detail: 'No profile form found' });

  const saveBtn = await page.$('button[type="submit"], .btn-save');
  if (!saveBtn) findings.push({ severity: 'warn', type: 'no_save_btn', detail: 'No save button on profile page' });
}

// ── RUN ALL ROUTES ────────────────────────────────────────────────────────────

console.log('\n=== STEP 2: Auditing all routes ===');
for (const route of routes) {
  await capturePageAudit(route.label, route.url, route.actions);
  await page.waitForTimeout(500);
}

// ── INTERACTION TESTS ─────────────────────────────────────────────────────────

console.log('\n=== STEP 3: Interaction tests ===');

// Test alert status change
await capturePageAudit('26_Alert_Status_Click', '/data/alerts', async (page, findings) => {
  await page.waitForTimeout(3000);
  const firstRow = await page.$('table tbody tr:first-child');
  if (firstRow) {
    await firstRow.click();
    await page.waitForTimeout(1500);
    const detail = await page.$('[class*="detail"], [class*="side-panel"], ngb-offcanvas, .offcanvas');
    if (!detail) findings.push({ severity: 'warn', type: 'no_alert_detail_panel', detail: 'Clicking alert row did not open detail panel' });
    else findings.push({ severity: 'info', type: 'alert_detail_opens', detail: 'Alert detail panel opened on row click ✅' });
  } else {
    findings.push({ severity: 'info', type: 'no_alert_rows', detail: 'No alert rows to click (empty data)' });
  }
});

// Test dashboard date filter
await capturePageAudit('27_Dashboard_Date_Filter', '/dashboard', async (page, findings) => {
  await page.waitForTimeout(2000);
  const dateBtn = await page.$('app-date-range button, [class*="date-range"] button, [class*="time-filter"] button');
  if (dateBtn) {
    await dateBtn.click();
    await page.waitForTimeout(1000);
    const picker = await page.$('ngb-datepicker, .ngb-dp, [class*="datepicker"]');
    if (!picker) findings.push({ severity: 'warn', type: 'date_picker_not_open', detail: 'Clicking date filter did not open date picker' });
    else findings.push({ severity: 'info', type: 'date_picker_opens', detail: 'Date picker opens on click ✅' });
  } else {
    findings.push({ severity: 'warn', type: 'no_date_filter_btn', detail: 'No date filter button found on dashboard' });
  }
});

// Test log search
await capturePageAudit('28_Log_Search_Input', '/discover', async (page, findings) => {
  await page.waitForTimeout(3000);
  const searchInput = await page.$('input, textarea[class*="query"]');
  if (searchInput) {
    await searchInput.click();
    await searchInput.type('severity:High');
    await page.waitForTimeout(500);
    findings.push({ severity: 'info', type: 'search_input_works', detail: 'Search input accepts text ✅' });
  } else {
    findings.push({ severity: 'warn', type: 'no_search_input', detail: 'No search input found in log analyzer' });
  }
});

// Test incident creation button
await capturePageAudit('29_Incident_Create_Modal', '/incident', async (page, findings) => {
  await page.waitForTimeout(3000);
  const createBtn = await page.$('button.btn-primary, button[title*="create" i], button[title*="New" i]');
  if (createBtn) {
    await createBtn.click();
    await page.waitForTimeout(1500);
    const modal = await page.$('ngb-modal-window, .modal.show, [class*="modal"]');
    if (!modal) findings.push({ severity: 'warn', type: 'no_create_modal', detail: 'Create button click did not open modal' });
    else findings.push({ severity: 'info', type: 'create_modal_opens', detail: 'Create modal opened ✅' });
    // close modal
    const closeBtn = await page.$('button[aria-label="Close"], .btn-close, .modal .close');
    if (closeBtn) await closeBtn.click();
  } else {
    findings.push({ severity: 'info', type: 'no_create_btn', detail: 'No create button found (may need data)' });
  }
});

// Test sidebar collapse
await capturePageAudit('30_Sidebar_Collapse', '/dashboard', async (page, findings) => {
  await page.waitForTimeout(2000);
  const collapseBtn = await page.$('[class*="nav-toggle"], [class*="sidebar-toggle"], button[title*="collapse" i]');
  if (collapseBtn) {
    await collapseBtn.click();
    await page.waitForTimeout(800);
    const collapsed = await page.$('.nav-collapsed, [class*="collapsed"]');
    if (!collapsed) findings.push({ severity: 'warn', type: 'sidebar_collapse_broken', detail: 'Sidebar collapse button did not collapse nav' });
    else findings.push({ severity: 'info', type: 'sidebar_collapse_works', detail: 'Sidebar collapses correctly ✅' });
  } else {
    findings.push({ severity: 'warn', type: 'no_collapse_btn', detail: 'No sidebar collapse button found' });
  }
});

// ── WRITE REPORT ──────────────────────────────────────────────────────────────

await browser.close();

// summarise
const totalErrors = auditReport.pages.reduce((n, p) => n + p.consoleErrors.length + p.networkErrors.length, 0);
const totalFindings = auditReport.pages.reduce((n, p) => n + p.findings.length, 0);
const errorFindings = auditReport.pages.reduce((n, p) => n + p.findings.filter(f => f.severity === 'error').length, 0);
const warnFindings = auditReport.pages.reduce((n, p) => n + p.findings.filter(f => f.severity === 'warn').length, 0);

auditReport.summary = {
  totalPages: auditReport.pages.length,
  totalConsoleErrors: totalErrors,
  totalFindings,
  errorFindings,
  warnFindings,
  screenshotDir: SCREENSHOT_DIR
};

fs.writeFileSync(REPORT_FILE, JSON.stringify(auditReport, null, 2));
console.log('\n=== AUDIT COMPLETE ===');
console.log(`Pages: ${auditReport.pages.length}`);
console.log(`Console errors: ${totalErrors}`);
console.log(`Total findings: ${totalFindings} (${errorFindings} errors, ${warnFindings} warnings)`);
console.log(`Report: ${REPORT_FILE}`);
console.log(`Screenshots: ${SCREENSHOT_DIR}/`);
