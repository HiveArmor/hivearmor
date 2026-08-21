import { createServer } from 'node:http';

let visualState = 'healthy';
const account = {
  id: 41,
  login: 'maya.chen',
  firstName: 'Maya',
  lastName: 'Chen',
  email: 'maya.chen@example.test',
  activated: true,
  langKey: 'en',
  authorities: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER'],
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:8088');
  const path = url.pathname;

  if (path === '/api/__visual-state') {
    visualState = url.searchParams.get('mode') ?? 'healthy';
    return send(response, 200, { visualState });
  }
  if (path === '/api/authenticate' && request.method === 'POST') return send(response, 200, { token: 'visual-validation-token' });
  if (path === '/api/account') return send(response, 200, account);
  if (path === '/api/ha-oidc/providers/enabled') return send(response, 200, []);
  if (path === '/api/overview/health') return send(response, 200, { status: 'UP' });
  if (path === '/api/ha-admin/system-info') return send(response, 200, { airGapMode: false });
  if (request.headers.accept?.includes('text/event-stream')) {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    response.end('data: {"eps":1840000,"timestamp":"2026-08-02T08:00:00Z"}\n\n');
    return;
  }

  const isFoundationQuery = path.includes('count-alerts') || path === '/api/ha-incidents';
  if (isFoundationQuery && visualState === 'loading') await new Promise((done) => setTimeout(done, 12000));
  if (isFoundationQuery && visualState === 'error') return send(response, 503, { message: 'Unavailable for visual validation' });
  if (path.endsWith('/count-alerts-today-and-last-week')) return send(response, 200, [{ serie: 'Today', value: 55 }, { serie: 'Last 7 days', value: 391 }]);
  if (path.endsWith('/count-alerts-by-severity')) return send(response, 200, { data: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], value: [{ name: 'CRITICAL', value: 4 }, { name: 'HIGH', value: 11 }, { name: 'MEDIUM', value: 18 }, { name: 'LOW', value: 22 }] });
  if (path === '/api/ha-incidents') {
    const items = [{ id: 2841, title: 'Suspicious privileged-account login', description: '', severity: 'CRITICAL', status: 'OPEN', assignee: null, createdAt: '2026-08-02T07:42:00Z', updatedAt: '2026-08-02T07:44:00Z', closedAt: null, slaDueAt: '2026-08-02T08:12:00Z', alertCount: 6, evidenceCount: 8, noteCount: 2, tenant: { id: 1, name: 'Northwind Financial' }, mitreTechniques: [] }];
    return send(response, 200, items, { 'x-total-count': '1' });
  }
  return send(response, 200, []);
});

server.listen(8088, '127.0.0.1', () => console.log('Visual validation API listening on http://127.0.0.1:8088'));
