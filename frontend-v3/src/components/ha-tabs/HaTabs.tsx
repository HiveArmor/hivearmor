import { Tabs, Tab, TabTitleText } from '@patternfly/react-core';

export interface HaTabsProps {
  tabs: Array<{
    key: string;
    title: React.ReactNode;
    content: React.ReactNode;
    isDisabled?: boolean;
  }>;
  activeKey?: string | number;
  onSelect?: (key: string) => void;
  className?: string;
}

export function HaTabs({
  tabs,
  activeKey,
  onSelect,
  className,
}: HaTabsProps): JSX.Element {
  return (
    <Tabs
      activeKey={activeKey}
      onSelect={(_event, eventKey) => onSelect?.(String(eventKey))}
      className={className}
      style={{
        '--pf-v5-c-tabs--BackgroundColor': 'var(--ha-surface-primary)',
        '--pf-v5-c-tabs__link--Color': 'var(--ha-text-secondary)',
        '--pf-v5-c-tabs__link--active--Color': 'var(--ha-primary)',
        '--pf-v5-c-tabs__link--BorderBottomColor': 'var(--ha-border)',
        '--pf-v5-c-tabs__link--active--BorderBottomColor': 'var(--ha-primary)',
      } as React.CSSProperties}
    >
      {tabs.map((tab) => (
        <Tab
          key={tab.key}
          eventKey={tab.key}
          title={<TabTitleText>{tab.title}</TabTitleText>}
          isDisabled={tab.isDisabled}
        >
          {tab.content}
        </Tab>
      ))}
    </Tabs>
  );
}
