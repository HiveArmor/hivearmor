/**
 * PlaybookBuilderPage.stories.tsx
 *
 * Storybook CSF3 stories for the HiveArmor Playbook Builder page (T02, Req 2.13).
 *
 * Four variants:
 *   1. CreateMode          — empty name, no steps, create route (no `id` param)
 *   2. EditModeWithSteps   — pre-populated with name, description, and 3 steps
 *                            (condition, action, delay)
 *   3. EditModeEmpty       — loaded edit mode with name but zero steps
 *   4. ValidationErrors    — save attempted with empty name showing validation errors
 *
 * The page uses `useParams()` and `useNavigate()` from react-router-dom — each
 * story wraps the component in a `MemoryRouter` with matching `<Routes>` /
 * `<Route>` elements so params resolve correctly.
 *
 * MSW v2 handlers intercept the relevant `/api/ha-playbooks/*` endpoints so
 * each story renders realistically without a running backend.
 *
 * `@monaco-editor/react` is lazy-loaded inside the component; the Monaco
 * container will render its fallback ("Loading editor…") inside Storybook
 * unless a real Monaco bundle is available — this is acceptable for visual
 * story purposes and is NOT mocked here (no Vitest context in Storybook).
 *
 * Validates: Requirements 2.13
 */

import React from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { PlaybookBuilderPage } from './PlaybookBuilderPage';

import { useAuthStore, type HaUser } from '@/store/auth.store';
import type { Playbook } from '@/types/playbook';

// ---------------------------------------------------------------------------
// Fixture — admin user (write endpoints require ROLE_ADMIN)
// ---------------------------------------------------------------------------

const ADMIN_USER: HaUser = {
  id: 1,
  login: 'admin',
  firstName: 'Ada',
  lastName: 'Admin',
  email: 'admin@hivearmor.local',
  roles: ['ROLE_ADMIN'],
  langKey: 'en',
};

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.story.token';

// ---------------------------------------------------------------------------
// Fixture — sample playbook returned by GET /api/ha-playbooks/:id
// ---------------------------------------------------------------------------

const PLAYBOOK_WITH_STEPS: Playbook = {
  id: 42,
  name: 'Critical Alert Response',
  description: 'Isolate host, block C2 IP, and notify the SOC team.',
  triggerType: 'alert-triggered',
  active: true,
  runCount: 7,
  lastRunAt: '2026-07-24T18:00:00Z',
  lastRunStatus: 'success',
  steps: [
    {
      stepIndex: 0,
      stepType: 'condition',
      label: 'Check severity',
      config: {
        expression: 'alert.severity >= 90',
        onFalseBehavior: 'skip',
      },
    },
    {
      stepIndex: 1,
      stepType: 'action',
      label: 'Isolate endpoint',
      config: {
        selectedCategory: 'EDR',
        actionId: 'isolate-host',
      },
    },
    {
      stepIndex: 2,
      stepType: 'delay',
      label: 'Wait before notification',
      config: {
        duration: 30,
        unit: 'seconds',
      },
    },
  ],
};

const PLAYBOOK_EMPTY_STEPS: Playbook = {
  id: 99,
  name: 'Blank Playbook Draft',
  description: 'A playbook with no steps yet.',
  triggerType: 'manual',
  active: false,
  runCount: 0,
  lastRunAt: null,
  lastRunStatus: null,
  steps: [],
};

// ---------------------------------------------------------------------------
// MSW handler factories
// ---------------------------------------------------------------------------

/** Returns the playbook with 3 pre-configured steps. */
const fetchPlaybookWithStepsHandler = http.get('/api/ha-playbooks/42', () =>
  HttpResponse.json(PLAYBOOK_WITH_STEPS),
);

/** Returns a playbook that has no steps (blank draft). */
const fetchPlaybookEmptyStepsHandler = http.get('/api/ha-playbooks/99', () =>
  HttpResponse.json(PLAYBOOK_EMPTY_STEPS),
);

/** Accepts a PUT and echoes back the request body merged with stable meta. */
const updatePlaybookHandler = http.put(
  '/api/ha-playbooks/:id',
  async ({ request, params }) => {
    const body = await request.json() as Partial<Playbook>;
    return HttpResponse.json({
      ...PLAYBOOK_WITH_STEPS,
      id: Number(params['id']),
      ...body,
    });
  },
);

/** Accepts a POST and returns the created playbook with a new id. */
const createPlaybookHandler = http.post('/api/ha-playbooks', async ({ request }) => {
  const body = await request.json() as Partial<Playbook>;
  return HttpResponse.json(
    {
      id: 100,
      runCount: 0,
      lastRunAt: null,
      lastRunStatus: null,
      ...body,
    },
    { status: 201 },
  );
});

// ---------------------------------------------------------------------------
// Decorator factory
// ---------------------------------------------------------------------------

interface DecoratorOptions {
  /** Route path pattern, e.g. "/response/playbooks/new" or "/response/playbooks/:id/edit" */
  routePattern: string;
  /** Initial URL the MemoryRouter navigates to */
  initialEntry: string;
}

/**
 * Returns a Storybook decorator that wraps the story with:
 *   - Auth store seeded with an admin user so write-gated UI is enabled
 *   - A fresh QueryClient (retry disabled for fast story rendering)
 *   - MemoryRouter + Routes so `useParams` resolves correctly
 */
function makeDecorator(
  user: HaUser,
  { routePattern, initialEntry }: DecoratorOptions,
): (Story: React.ComponentType) => React.ReactElement {
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
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path={routePattern} element={<Story />} />
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
  title: 'HiveArmor/Pages/PlaybookBuilderPage',
  component: PlaybookBuilderPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'HiveArmor Playbook Builder — linear form-driven step editor for creating and ' +
          'editing SOAR playbooks. Supports Condition (CEL / Monaco), Action, Delay, and ' +
          'Loop step types. Routes: `/response/playbooks/new` (create mode) and ' +
          '`/response/playbooks/:id/edit` (edit mode). Requires ROLE_ADMIN.',
      },
    },
  },
} satisfies Meta<typeof PlaybookBuilderPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Story 1 — CreateMode
// No `id` param → create route. Form starts with an empty name, empty
// description, no steps. The Save button calls POST /api/ha-playbooks.
// ---------------------------------------------------------------------------

export const CreateMode: Story = {
  name: 'Create Mode (new playbook)',
  decorators: [
    makeDecorator(ADMIN_USER, {
      routePattern: '/response/playbooks/new',
      initialEntry: '/response/playbooks/new',
    }),
  ],
  parameters: {
    msw: {
      handlers: [createPlaybookHandler],
    },
    docs: {
      description: {
        story:
          'Create route — no `id` param. The name field is empty, description is blank, ' +
          'Active is toggled on, trigger is "Manual", and the step list shows the ' +
          '"No steps yet" placeholder. Clicking "+ Add Step" inserts a blank step card. ' +
          'Saving a valid form calls POST /api/ha-playbooks and navigates to the new ' +
          'playbook detail page.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 2 — EditModeWithSteps
// Edit route for playbook id 42. MSW returns the pre-populated playbook with
// three steps: a condition (CEL expression), an EDR action, and a 30-second delay.
// ---------------------------------------------------------------------------

export const EditModeWithSteps: Story = {
  name: 'Edit Mode — 3 steps (condition, action, delay)',
  decorators: [
    makeDecorator(ADMIN_USER, {
      routePattern: '/response/playbooks/:id/edit',
      initialEntry: '/response/playbooks/42/edit',
    }),
  ],
  parameters: {
    msw: {
      handlers: [fetchPlaybookWithStepsHandler, updatePlaybookHandler],
    },
    docs: {
      description: {
        story:
          'Edit route for playbook 42 "Critical Alert Response". MSW returns the ' +
          'playbook with 3 steps: Step 1 — Condition ("Check severity", CEL expression ' +
          '`alert.severity >= 90`, on-false: skip remaining); Step 2 — Action ("Isolate ' +
          'endpoint", category EDR, action isolate-host); Step 3 — Delay ("Wait before ' +
          'notification", 30 seconds = 30 seconds). All step cards expand with their ' +
          'type-specific body. Saving calls PUT /api/ha-playbooks/42.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 3 — EditModeEmpty
// Edit route for playbook id 99. MSW returns a playbook with name and description
// but an empty steps array. The builder renders the step list in its empty state.
// ---------------------------------------------------------------------------

export const EditModeEmpty: Story = {
  name: 'Edit Mode — no steps (empty draft)',
  decorators: [
    makeDecorator(ADMIN_USER, {
      routePattern: '/response/playbooks/:id/edit',
      initialEntry: '/response/playbooks/99/edit',
    }),
  ],
  parameters: {
    msw: {
      handlers: [
        fetchPlaybookEmptyStepsHandler,
        http.put('/api/ha-playbooks/99', async ({ request }) => {
          const body = await request.json() as Partial<Playbook>;
          return HttpResponse.json({ ...PLAYBOOK_EMPTY_STEPS, ...body });
        }),
      ],
    },
    docs: {
      description: {
        story:
          'Edit route for playbook 99 "Blank Playbook Draft". MSW returns the playbook ' +
          'with name and description pre-populated but zero steps. The step section ' +
          'renders the "No steps yet. Click + Add Step to begin." placeholder with the ' +
          'top-level Add Step button visible. Active is toggled off to match the fixture.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 4 — ValidationErrors
// Create route with a save attempt on an empty name. The story uses a render
// decorator that clicks the Save button after mount so inline validation errors
// are visible immediately when the story loads.
// ---------------------------------------------------------------------------

const ValidationDecorator = (Story: React.ComponentType): React.ReactElement => {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Allow the component to fully mount, then trigger Save to surface errors.
    const id = window.setTimeout(() => {
      const saveBtn = ref.current?.querySelector<HTMLButtonElement>(
        'button[data-variant="primary"], button.ha-button--primary',
      );
      // Fallback: find any button whose text content is "Save"
      const allButtons = ref.current?.querySelectorAll<HTMLButtonElement>('button');
      const saveFallback = allButtons
        ? Array.from(allButtons).find((b) => b.textContent?.trim() === 'Save')
        : undefined;
      (saveBtn ?? saveFallback)?.click();
    }, 300);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <Story />
    </div>
  );
};

export const ValidationErrors: Story = {
  name: 'Validation Errors (empty name on save)',
  decorators: [
    makeDecorator(ADMIN_USER, {
      routePattern: '/response/playbooks/new',
      initialEntry: '/response/playbooks/new',
    }),
    ValidationDecorator,
  ],
  parameters: {
    msw: {
      handlers: [createPlaybookHandler],
    },
    docs: {
      description: {
        story:
          'Create route with no name entered. The ValidationDecorator clicks the Save ' +
          'button ~300 ms after mount, triggering the inline validation pass. The name ' +
          'input gains a red `var(--ha-critical)` border and a PatternFly FormHelperText ' +
          'error reads "Playbook name is required." The Save button remains disabled ' +
          'while errors are present. No API call is made.',
      },
    },
  },
};
