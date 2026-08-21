/**
 * SystemSettingsPage — four-tab HiveArmor system configuration page.
 *
 * Route:   /settings/system  (registered in task 1.7, guarded by AuthGuard ROLE_ADMIN)
 * Tabs:    General | Email/SMTP | AI/LLM | Security
 *
 * All colours referenced via var(--ha-*) design tokens — no hex literals.
 * No `any` types.  Product name: HiveArmor.
 *
 * Requirements: 1.2, 13.5, 13.9, 13.10
 */

import { useState } from 'react';


import { AiLlmTab } from './tabs/AiLlmTab';
import { EmailTab } from './tabs/EmailTab';
import { GeneralTab } from './tabs/GeneralTab';
import { SecurityTab } from './tabs/SecurityTab';

import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { HaTabs } from '@/components/ha-tabs/HaTabs';

type SettingsTab = 'general' | 'email' | 'ai-llm' | 'security';

const TABS: Array<{ key: SettingsTab; title: string }> = [
  { key: 'general',  title: 'General' },
  { key: 'email',    title: 'Email/SMTP' },
  { key: 'ai-llm',  title: 'AI/LLM' },
  { key: 'security', title: 'Security' },
];

function tabContent(key: SettingsTab): JSX.Element {
  switch (key) {
    case 'general':  return <GeneralTab />;
    case 'email':    return <EmailTab />;
    case 'ai-llm':  return <AiLlmTab />;
    case 'security': return <SecurityTab />;
  }
}

export function SystemSettingsPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const tabs = TABS.map((t) => ({
    key: t.key,
    title: t.title,
    content: tabContent(t.key),
  }));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ha-background)',
      }}
    >
      <SiemPageHeader
        title="System Settings"
        description="Manage HiveArmor platform-wide configuration: general options, email delivery, AI/LLM integration, and security policy."
        breadcrumbs={[{ label: 'Settings' }, { label: 'System' }]}
      />

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--ha-surface-primary)',
        }}
      >
        <HaTabs
          tabs={tabs}
          activeKey={activeTab}
          onSelect={(key) => setActiveTab(key as SettingsTab)}
        />
      </div>
    </div>
  );
}
