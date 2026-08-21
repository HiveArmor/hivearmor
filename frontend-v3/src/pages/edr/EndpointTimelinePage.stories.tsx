/**
 * EndpointTimelinePage.stories.tsx
 *
 * Storybook CSF3 stories for the HiveArmor Endpoint Timeline page (T02, Req 2.17).
 *
 * Three variants:
 *   1. Default  — sample EDR events with a mix of event types and severities
 *   2. Loading  — MSW delays the timeline response indefinitely; page stays in loading state
 *   3. Empty    — MSW returns an empty page; "no events found" state is shown
 *
 * MSW v2 handlers intercept GET /api/ha-edr/timeline so each story reflects
 * realistic network behaviour without a running backend.
 *
 * The page uses `useParams` from react-router-dom — each story wraps the
 * component in a `MemoryRouter` with `initialEntries` pointing to a concrete
 * agentId path so the hook resolves correctly.
 *
 * Validates: Requirements 2.17
 */

import React from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, delay } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { EndpointTimelinePage } from './EndpointTimelinePage';

import { useAuthStore, type HaUser } from '@/store/auth.store';
import type { EdrEventDTO, EdrTimelinePage } from '@/types/edr';

// ---------------------------------------------------------------------------
// Fixture data — sample analyst user
// ---------------------------------------------------------------------------

const ANALYST_USER: HaUser = {
  id: 1,
  login: 'analyst',
  firstName: 'Alice',
  lastName: 'Analyst',
  email: 'analyst@hivearmor.local',
  roles: ['ROLE_ANALYST'],
  langKey: 'en',
};

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.story.token';

// ---------------------------------------------------------------------------
// Sample EDR events — mix of all event types and all severity bands
// ---------------------------------------------------------------------------

const SAMPLE_EVENTS: EdrEventDTO[] = [
  // process_start — Critical (95)
  {
    id: 'evt-001',
    agentId: 'agent-win-dc01',
    eventType: 'process_start',
    severity: 95,
    timestamp: '2026-07-25T08:01:00Z',
    processName: 'mimikatz.exe',
    pid: 4096,
    user: 'CORP\\attacker',
    details: {
      cmdline: 'mimikatz.exe sekurlsa::logonpasswords',
      parentPid: 2048,
      parentName: 'cmd.exe',
      sha256: 'a3c5e1f7b2d8094a6b1c3e5d7f901234a3c5e1f7b2d8094a6b1c3e5d7f901234',
      mitre: 'T1003.001',
    },
  },
  // network_connect — High (75)
  {
    id: 'evt-002',
    agentId: 'agent-win-dc01',
    eventType: 'network_connect',
    severity: 75,
    timestamp: '2026-07-25T08:02:15Z',
    processName: 'mimikatz.exe',
    pid: 4096,
    user: 'CORP\\attacker',
    details: {
      destinationIp: '10.0.0.99',
      destinationPort: 4444,
      protocol: 'TCP',
      direction: 'outbound',
    },
  },
  // file_create — Medium (55)
  {
    id: 'evt-003',
    agentId: 'agent-win-dc01',
    eventType: 'file_create',
    severity: 55,
    timestamp: '2026-07-25T08:03:30Z',
    processName: 'cmd.exe',
    pid: 2048,
    user: 'CORP\\attacker',
    details: {
      filePath: 'C:\\Windows\\Temp\\payload.exe',
      fileSize: 204800,
      sha256: 'b4d6e2f8c3a9105b7c2d4e6f8a012345b4d6e2f8c3a9105b7c2d4e6f8a012345',
    },
  },
  // registry_set — High (72)
  {
    id: 'evt-004',
    agentId: 'agent-win-dc01',
    eventType: 'registry_set',
    severity: 72,
    timestamp: '2026-07-25T08:04:00Z',
    processName: 'payload.exe',
    pid: 5120,
    user: 'CORP\\attacker',
    details: {
      key: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      valueName: 'Updater',
      valueData: 'C:\\Windows\\Temp\\payload.exe',
      operation: 'SetValue',
    },
  },
  // process_end — Low (10)
  {
    id: 'evt-005',
    agentId: 'agent-win-dc01',
    eventType: 'process_end',
    severity: 10,
    timestamp: '2026-07-25T08:05:00Z',
    processName: 'notepad.exe',
    pid: 3072,
    user: 'CORP\\jdoe',
    details: {
      exitCode: 0,
      durationMs: 12400,
    },
  },
  // user_logon — Medium (45)
  {
    id: 'evt-006',
    agentId: 'agent-win-dc01',
    eventType: 'user_logon',
    severity: 45,
    timestamp: '2026-07-25T08:06:30Z',
    processName: 'lsass.exe',
    pid: 720,
    user: 'CORP\\attacker',
    details: {
      logonType: 3,
      logonTypeName: 'Network',
      sourceIp: '192.168.1.55',
      workstation: 'ATTACKER-HOST',
    },
  },
  // file_modify — Low (20)
  {
    id: 'evt-007',
    agentId: 'agent-win-dc01',
    eventType: 'file_modify',
    severity: 20,
    timestamp: '2026-07-25T08:07:45Z',
    processName: 'svchost.exe',
    pid: 1024,
    user: 'NT AUTHORITY\\SYSTEM',
    details: {
      filePath: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
      previousSize: 825,
      newSize: 854,
    },
  },
  // network_listen — Low (15)
  {
    id: 'evt-008',
    agentId: 'agent-win-dc01',
    eventType: 'network_listen',
    severity: 15,
    timestamp: '2026-07-25T08:08:00Z',
    processName: 'payload.exe',
    pid: 5120,
    user: 'CORP\\attacker',
    details: {
      port: 8080,
      protocol: 'TCP',
      bindAddress: '0.0.0.0',
    },
  },
  // file_delete — Critical (90)
  {
    id: 'evt-009',
    agentId: 'agent-win-dc01',
    eventType: 'file_delete',
    severity: 90,
    timestamp: '2026-07-25T08:09:10Z',
    processName: 'payload.exe',
    pid: 5120,
    user: 'CORP\\attacker',
    details: {
      filePath: 'C:\\Windows\\System32\\winevt\\Logs\\Security.evtx',
      reason: 'Log tampering — event log deleted',
    },
  },
  // registry_delete — Medium (60)
  {
    id: 'evt-010',
    agentId: 'agent-win-dc01',
    eventType: 'registry_delete',
    severity: 60,
    timestamp: '2026-07-25T08:10:00Z',
    processName: 'cmd.exe',
    pid: 2048,
    user: 'CORP\\attacker',
    details: {
      key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\EventLog\\Security',
      operation: 'DeleteKey',
    },
  },
  // user_logoff — Low (5)
  {
    id: 'evt-011',
    agentId: 'agent-win-dc01',
    eventType: 'user_logoff',
    severity: 5,
    timestamp: '2026-07-25T08:11:00Z',
    processName: 'lsass.exe',
    pid: 720,
    user: 'CORP\\jdoe',
    details: {
      sessionDurationMs: 7200000,
      logoffType: 'interactive',
    },
  },
];

const SAMPLE_PAGE: EdrTimelinePage = {
  content: SAMPLE_EVENTS,
  totalElements: SAMPLE_EVENTS.length,
  totalPages: 1,
  number: 0,
};

const EMPTY_PAGE: EdrTimelinePage = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
};

// ---------------------------------------------------------------------------
// MSW handler factories
// ---------------------------------------------------------------------------

/** Returns a realistic event page. */
const timelineSuccessHandler = http.get('/api/ha-edr/timeline', () =>
  HttpResponse.json(SAMPLE_PAGE),
);

/** Delays the response indefinitely — keeps the page in its loading state. */
const timelineLoadingHandler = http.get('/api/ha-edr/timeline', async () => {
  await delay('infinite');
  return HttpResponse.json(EMPTY_PAGE);
});

/** Returns an empty page — triggers the "no events found" empty state. */
const timelineEmptyHandler = http.get('/api/ha-edr/timeline', () =>
  HttpResponse.json(EMPTY_PAGE),
);

// ---------------------------------------------------------------------------
// Story providers decorator factory
// ---------------------------------------------------------------------------

/**
 * Returns a Storybook decorator that wraps the story with:
 *   - A fresh QueryClient (retry disabled for fast story rendering)
 *   - MemoryRouter with a route that matches /edr/timeline/:agentId
 *     so `useParams` resolves `agentId` correctly inside the page
 *   - Auth store seeded with a valid analyst session
 */
function makeDecorator(user: HaUser): (Story: React.ComponentType) => React.ReactElement {
  function StoryDecorator(Story: React.ComponentType): React.ReactElement {
    React.useEffect(() => {
      useAuthStore.setState({
        user,
        token: FAKE_TOKEN,
        isAuthenticated: true,
        isLoading: false,
      });
    }, []);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
      },
    });

    return (
      <QueryClientProvider client={queryClient}>
        {/*
          MemoryRouter navigates to the concrete agent path.
          The nested <Routes> / <Route> re-mounts the page component at the
          matching path so useParams returns { agentId: 'agent-win-dc01' }.
        */}
        <MemoryRouter initialEntries={['/edr/timeline/agent-win-dc01']}>
          <Routes>
            <Route path="/edr/timeline/:agentId" element={<Story />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return StoryDecorator;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'HiveArmor/Pages/EndpointTimelinePage',
  component: EndpointTimelinePage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'HiveArmor Endpoint Timeline page — chronological EDR events for a ' +
          'single agent, combining a scatter chart, AG Grid events table, and a ' +
          'Monaco JSON detail drawer with optional process tree drill-down.',
      },
    },
  },
} satisfies Meta<typeof EndpointTimelinePage>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Story 1 — Default
// Realistic mix of eleven EDR event types covering all four severity bands.
// The scatter chart, AG Grid, and filter bar are all rendered.
// ---------------------------------------------------------------------------

export const Default: Story = {
  name: 'Default (events loaded)',
  decorators: [makeDecorator(ANALYST_USER)],
  parameters: {
    msw: {
      handlers: [timelineSuccessHandler],
    },
    docs: {
      description: {
        story:
          'Eleven EDR events spanning all event types (process_start through user_logoff) ' +
          'and all severity bands (Critical, High, Medium, Low). The scatter chart plots ' +
          'each event by type and time. Clicking a row opens the Monaco JSON drawer; ' +
          'selecting a process_* event reveals the "Show Process Tree" button.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 2 — Loading
// MSW delays the /api/ha-edr/timeline response indefinitely so the page
// stays in its loading state: skeleton rows above the AG Grid and the
// loading indicator above the scatter chart are both visible.
// ---------------------------------------------------------------------------

export const Loading: Story = {
  name: 'Loading (data pending)',
  decorators: [makeDecorator(ANALYST_USER)],
  parameters: {
    msw: {
      handlers: [timelineLoadingHandler],
    },
    docs: {
      description: {
        story:
          'MSW delays the timeline fetch indefinitely. The spinner above the chart and ' +
          'the AG Grid skeleton rows are visible. The filter bar remains interactive.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 3 — Empty
// MSW returns an empty content array. The page renders the empty-state panel
// with the Activity icon and "No events found in the selected range" message.
// ---------------------------------------------------------------------------

export const Empty: Story = {
  name: 'Empty (no events)',
  decorators: [makeDecorator(ANALYST_USER)],
  parameters: {
    msw: {
      handlers: [timelineEmptyHandler],
    },
    docs: {
      description: {
        story:
          'The backend returns zero events for the selected time range. ' +
          'The scatter chart renders empty axes and the grid area shows the ' +
          '"No events found in the selected range" empty-state with the Activity icon.',
      },
    },
  },
};
