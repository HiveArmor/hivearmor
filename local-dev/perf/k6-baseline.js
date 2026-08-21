/**
 * HiveArmor Sprint 49 — Performance Baseline (k6)
 *
 * Establishes p95 latency baselines for 5 key endpoints under sustained load.
 * Results documented in docs/performance-baseline-sprint-49.md
 *
 * Prerequisites:
 *   - k6 installed: https://grafana.com/docs/k6/latest/set-up/install-k6/
 *     macOS:   brew install k6
 *     Linux:   sudo gpg -k; sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
 *              --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69; \
 *              echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
 *              sudo tee /etc/apt/sources.list.d/k6.list; sudo apt-get update; sudo apt-get install k6
 *     Docker:  docker run --rm -i grafana/k6 run - <k6-baseline.js
 *   - Local-dev stack running: cd local-dev && docker compose up -d
 *   - Seeded test data: bash local-dev/seed-data.sh
 *
 * Usage:
 *   k6 run local-dev/perf/k6-baseline.js
 *
 * Environment variables (optional):
 *   BASE_URL   — Backend URL (default: http://localhost:8088)
 *   USERNAME   — Login username (default: admin)
 *   PASSWORD   — Login password (default: localdev123!)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8088';
const USERNAME = __ENV.USERNAME || 'admin';
const PASSWORD = __ENV.PASSWORD || 'localdev123!';

export const options = {
  scenarios: {
    alert_queue: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      exec: 'alertQueue',
      tags: { scenario: 'alert_queue' },
    },
    severity_board: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      exec: 'severityBoard',
      tags: { scenario: 'severity_board' },
    },
    hunt_search: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      exec: 'huntSearch',
      tags: { scenario: 'hunt_search' },
    },
    entity_inventory: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      exec: 'entityInventory',
      tags: { scenario: 'entity_inventory' },
    },
    constellation_explore: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      exec: 'constellationExplore',
      tags: { scenario: 'constellation_explore' },
    },
  },
  thresholds: {
    'http_req_duration{scenario:alert_queue}': ['p(95)<2000'],
    'http_req_duration{scenario:severity_board}': ['p(95)<1500'],
    'http_req_duration{scenario:hunt_search}': ['p(95)<5000'],
    'http_req_duration{scenario:entity_inventory}': ['p(95)<2000'],
    'http_req_duration{scenario:constellation_explore}': ['p(95)<3000'],
  },
};

// ---------------------------------------------------------------------------
// Authentication Helper — login once per VU, reuse JWT token
// ---------------------------------------------------------------------------

let token = null;

function getAuthToken() {
  if (token) return token;

  const loginRes = http.post(
    `${BASE_URL}/api/authenticate`,
    JSON.stringify({
      username: USERNAME,
      password: PASSWORD,
      rememberMe: false,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  check(loginRes, {
    'login successful': (r) => r.status === 200,
  });

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    token = body.id_token || body.token;
  }

  return token;
}

function authHeaders() {
  const t = getAuthToken();
  return {
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json',
    },
  };
}

// ---------------------------------------------------------------------------
// Setup — authenticate once
// ---------------------------------------------------------------------------

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/authenticate`,
    JSON.stringify({
      username: USERNAME,
      password: PASSWORD,
      rememberMe: false,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (loginRes.status !== 200) {
    console.error(`Login failed: ${loginRes.status} ${loginRes.body}`);
    return { token: null };
  }

  const body = JSON.parse(loginRes.body);
  return { token: body.id_token || body.token };
}

// ---------------------------------------------------------------------------
// Scenario Functions
// ---------------------------------------------------------------------------

/**
 * Scenario: alert_queue
 * Endpoint: POST /api/ha-alerts/queue
 * Threshold: p95 < 2s
 */
export function alertQueue(data) {
  const res = http.post(
    `${BASE_URL}/api/ha-alerts/queue`,
    JSON.stringify({
      page: 0,
      size: 25,
      sort: ['timestamp,desc'],
    }),
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
      },
      tags: { scenario: 'alert_queue' },
    }
  );

  check(res, {
    'alert_queue status 200': (r) => r.status === 200,
    'alert_queue has content': (r) => r.body.length > 0,
  });

  sleep(1);
}

/**
 * Scenario: severity_board
 * Endpoint: POST /api/ha-alerts/severity-board
 * Threshold: p95 < 1.5s
 */
export function severityBoard(data) {
  const res = http.post(
    `${BASE_URL}/api/ha-alerts/severity-board`,
    JSON.stringify({
      timeRange: '24h',
    }),
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
      },
      tags: { scenario: 'severity_board' },
    }
  );

  check(res, {
    'severity_board status 200': (r) => r.status === 200,
    'severity_board has content': (r) => r.body.length > 0,
  });

  sleep(1);
}

/**
 * Scenario: hunt_search
 * Endpoint: POST /api/ha-hunt/search
 * Threshold: p95 < 5s
 */
export function huntSearch(data) {
  const res = http.post(
    `${BASE_URL}/api/ha-hunt/search`,
    JSON.stringify({
      query: 'process.name: "cmd.exe" OR process.name: "powershell.exe"',
      timeRange: '7d',
      page: 0,
      size: 50,
    }),
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
      },
      tags: { scenario: 'hunt_search' },
    }
  );

  check(res, {
    'hunt_search status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });

  sleep(2);
}

/**
 * Scenario: entity_inventory
 * Endpoint: GET /api/ha-entities
 * Threshold: p95 < 2s
 */
export function entityInventory(data) {
  const res = http.get(
    `${BASE_URL}/api/ha-entities?page=0&size=25&sort=lastSeen,desc`,
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
      },
      tags: { scenario: 'entity_inventory' },
    }
  );

  check(res, {
    'entity_inventory status 200': (r) => r.status === 200,
    'entity_inventory has content': (r) => r.body.length > 0,
  });

  sleep(1);
}

/**
 * Scenario: constellation_explore
 * Endpoint: POST /api/ha-graph/explore
 * Threshold: p95 < 3s
 */
export function constellationExplore(data) {
  const res = http.post(
    `${BASE_URL}/api/ha-graph/explore`,
    JSON.stringify({
      seed: {
        type: 'entity',
        value: 'server-dc01',
      },
      options: {
        hopDepth: 2,
        nodeLimit: 100,
      },
    }),
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
      },
      tags: { scenario: 'constellation_explore' },
    }
  );

  check(res, {
    'constellation status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });

  sleep(2);
}
