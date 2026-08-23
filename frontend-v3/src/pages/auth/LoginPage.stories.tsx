import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { LoginPage } from './LoginPage';

const meta: Meta = {
  title: 'Pages/Auth/LoginPage',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj;

function LoginStory({ entry = '/login' }: { entry?: string }): JSX.Element {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export const Default: Story = {
  render: () => <LoginStory />,
};

export const SessionExpired: Story = {
  render: () => <LoginStory entry="/login?expired=true" />,
};

export const AccountLocked: Story = {
  render: () => <LoginStory entry="/login?locked=true" />,
};

export const SsoPrompt: Story = {
  render: () => <LoginStory entry="/login?sso=prompt" />,
};

export const OidcCallbackFailed: Story = {
  render: () => <LoginStory entry="/login?error=oidc_callback_failed" />,
};
