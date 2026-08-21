/**
 * RuleImportPage.tsx — Rule Import admin page (T05, Req 5.1).
 *
 * Route: /admin/rules/import
 * Two-tab layout:
 *   - "Sigma Import"   → SigmaImportTab  (full implementation in Task 5.5)
 *   - "Custom Rules"   → CustomRulesTab  (full implementation in Task 5.6)
 *
 * Zero hard-coded hex colours — all colours via var(--ha-*) tokens.
 */

import { useState } from 'react';

import { CustomRulesTab } from './components/CustomRulesTab';
import { SigmaImportTab } from './components/SigmaImportTab';

import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { HaTabs } from '@/components/ha-tabs/HaTabs';

const TAB_SIGMA = 'sigma-import';
const TAB_CUSTOM = 'custom-rules';

export default function RuleImportPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<string>(TAB_SIGMA);

  const tabs = [
    {
      key: TAB_SIGMA,
      title: 'Sigma Import',
      content: <SigmaImportTab />,
    },
    {
      key: TAB_CUSTOM,
      title: 'Custom Rules',
      content: <CustomRulesTab />,
    },
  ];

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
        title="Rule Import"
        description="Import community Sigma rules or manage custom detection rules."
        breadcrumbs={[{ label: 'Admin' }, { label: 'Rules' }, { label: 'Import' }]}
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
          onSelect={setActiveTab}
        />
      </div>
    </div>
  );
}
