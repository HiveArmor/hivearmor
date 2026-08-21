/** HaMasthead — persistent operational and tenant context. */

import { useEffect, useMemo, useRef, useState } from 'react';

import { Building2, Check, ChevronDown, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { DataHealthBadge } from './DataHealthBadge';
import { HelpButton } from './HelpButton';
import { HiveArmorLogo } from './HiveArmorLogo';
import { LiveEpsBadge } from './LiveEpsBadge';
import { NotificationsBell } from './NotificationsBell';

import { useAuthStore } from '@/store/auth.store';

import './HaMasthead.css';

export interface HaMastheadProps {
  // No required props — all data comes from stores and hooks
}

/** Known tenants — in production this would come from a backend endpoint. */
const KNOWN_TENANTS = [
  { id: null, prefix: '', label: 'All authorized tenants', description: 'View events across all tenants you have access to' },
  { id: 1, prefix: 'acme', label: 'Acme', description: 'Local-dev tenant 1 · syslog + endpoint detection' },
  { id: 3812, prefix: 'workmates1', label: 'Workmates1', description: 'Primary workspace · EDR + Log collection' },
  { id: 3813, prefix: 'cwm', label: 'CWM', description: 'Cloud Workload Management · Cloud + Network' },
  { id: 3814, prefix: 'workmates2', label: 'Workmates2', description: 'Secondary workspace · Endpoint monitoring' },
] as const;

export function HaMasthead(_props: HaMastheadProps): JSX.Element {
  const [tenantOpen, setTenantOpen] = useState(false);
  const [tenantSearch, setTenantSearch] = useState('');
  const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
  const setSelectedTenant = useAuthStore((state) => state.setSelectedTenant);
  const navigate = useNavigate();
  const tenantMenuRef = useRef<HTMLDivElement>(null);

  const selectedTenant = KNOWN_TENANTS.find((t) => t.id === selectedTenantId) ?? KNOWN_TENANTS[0];
  const tenantLabel = selectedTenant.label;

  // Close tenant dropdown on outside click
  useEffect(() => {
    if (!tenantOpen) return undefined;
    const handleOutsideClick = (e: MouseEvent) => {
      if (tenantMenuRef.current && !tenantMenuRef.current.contains(e.target as Node)) {
        setTenantOpen(false);
        setTenantSearch('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [tenantOpen]);

  const filteredTenants = useMemo(() => {
    if (!tenantSearch.trim()) return KNOWN_TENANTS;
    const needle = tenantSearch.toLowerCase();
    return KNOWN_TENANTS.filter(
      (t) => t.label.toLowerCase().includes(needle) || t.prefix.toLowerCase().includes(needle)
    );
  }, [tenantSearch]);

  const handleSelectTenant = (tenantId: number | null) => {
    setSelectedTenant(tenantId);
    setTenantOpen(false);
    setTenantSearch('');
  };

  return (
    <header className="ha-masthead">
      <div className="ha-masthead__brand">
        <HiveArmorLogo size={28} />
        <span className="ha-masthead__wordmark">HiveArmor</span>
        <span className="ha-masthead__product-kicker">Security operations</span>
      </div>

      <div className="ha-masthead__context">
        <div className="ha-context-menu" ref={tenantMenuRef}>
          <button
            type="button"
            className="ha-context-button"
            aria-haspopup="menu"
            aria-expanded={tenantOpen}
            onClick={() => { setTenantOpen((open) => !open); setTenantSearch(''); }}
          >
            <Building2 size={15} aria-hidden="true" />
            <span>{tenantLabel}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {tenantOpen && (
            <div className="ha-context-popover" role="menu" aria-label="Tenant scope">
              <div className="ha-context-popover__search">
                <Search size={13} aria-hidden="true" />
                <input
                  type="text"
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  placeholder="Search tenants…"
                  aria-label="Search tenants"
                  autoFocus
                />
              </div>
              <span className="ha-context-popover__label">Select tenant scope</span>
              <div className="ha-context-popover__list">
                {filteredTenants.length === 0 && (
                  <div className="ha-context-popover__empty">No tenants match &ldquo;{tenantSearch}&rdquo;</div>
                )}
                {filteredTenants.map((tenant) => (
                  <button
                    key={tenant.id ?? 'all'}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedTenantId === tenant.id}
                    onClick={() => handleSelectTenant(tenant.id)}
                    className="ha-context-popover__item"
                  >
                    <div className="ha-context-popover__item-content">
                      <strong>{tenant.label}</strong>
                      <small>{tenant.description}</small>
                    </div>
                    {selectedTenantId === tenant.id && <Check size={15} aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className="ha-search-trigger" type="button" onClick={() => navigate('/search')}>
          <Search size={15} aria-hidden="true" />
          <span>Search alerts, incidents, entities…</span>
          <kbd aria-hidden="true">⌘ K</kbd>
        </button>
        <span className="ha-masthead__environment">Production</span>
      </div>

      <div className="ha-masthead__actions">
        <DataHealthBadge />
        <LiveEpsBadge />
        <NotificationsBell />
        <HelpButton />
      </div>
    </header>
  );
}
