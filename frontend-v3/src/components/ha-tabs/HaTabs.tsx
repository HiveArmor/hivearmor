import './HaTabs.css';

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
  const resolvedKey = activeKey !== undefined ? String(activeKey) : String(tabs[0]?.key ?? '');

  return (
    <div className={className ? `ha-tabs ${className}` : 'ha-tabs'}>
      <div className="ha-tabs__list" role="tablist">
        {tabs.map((tab) => {
          const isActive = resolvedKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`ha-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`ha-tabpanel-${tab.key}`}
              disabled={tab.isDisabled}
              className={isActive ? 'ha-tabs__tab ha-tabs__tab--active' : 'ha-tabs__tab'}
              onClick={() => onSelect?.(tab.key)}
            >
              {tab.title}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`ha-tabpanel-${tab.key}`}
          aria-labelledby={`ha-tab-${tab.key}`}
          hidden={resolvedKey !== tab.key}
          className="ha-tabs__panel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
