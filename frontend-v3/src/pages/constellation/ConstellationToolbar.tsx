import { useEffect, useState } from 'react';

import {
  Filter, LocateFixed, Maximize2, Minimize2, Minus, Pause, Play, Plus, RotateCcw, Search, X,
} from 'lucide-react';

import { EntityTypeIcon, entityTypeLabel } from '@/components/entity-type-icon';
import type { ConstellationFilters, EdgeType, EntityType } from '@/types/constellation.types';

interface ConstellationToolbarProps {
  filters: ConstellationFilters;
  paused: boolean;
  focusMode: boolean;
  onFiltersChange: (filters: Partial<ConstellationFilters>) => void;
  onResetView: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTogglePaused: () => void;
  onToggleFocusMode: () => void;
}

const ENTITY_TYPES: EntityType[] = ['host', 'user', 'ip', 'process', 'file', 'domain', 'service', 'cloud'];
const EDGE_TYPES: Array<{ value: EdgeType; label: string }> = [
  { value: 'CONNECTED_TO', label: 'Connections' },
  { value: 'AUTHENTICATED_TO', label: 'Authentication' },
  { value: 'LOGGED_IN_FROM', label: 'Logons' },
  { value: 'COMMUNICATED_WITH', label: 'Communications' },
  { value: 'EXECUTED_ON', label: 'Execution' },
  { value: 'SPAWNED', label: 'Process lineage' },
  { value: 'RESOLVED_TO', label: 'DNS resolution' },
  { value: 'ACCESSED', label: 'Access' },
  { value: 'CONTAINS', label: 'Containment' },
];

export function ConstellationToolbar({
  filters, paused, focusMode, onFiltersChange, onResetView, onFitView, onZoomIn, onZoomOut, onTogglePaused, onToggleFocusMode,
}: ConstellationToolbarProps): JSX.Element {
  const [searchValue, setSearchValue] = useState(filters.searchQuery ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => setSearchValue(filters.searchQuery ?? ''), [filters.searchQuery]);

  const toggleType = (type: EntityType) => {
    const next = filters.entityTypes.includes(type)
      ? filters.entityTypes.filter((candidate) => candidate !== type)
      : [...filters.entityTypes, type];
    if (next.length) onFiltersChange({ entityTypes: next });
  };

  const toggleEdge = (edgeType: EdgeType) => {
    const next = filters.edgeTypes.includes(edgeType)
      ? filters.edgeTypes.filter((candidate) => candidate !== edgeType)
      : [...filters.edgeTypes, edgeType];
    if (next.length) onFiltersChange({ edgeTypes: next });
  };

  return (
    <section className="constellation-toolbar" aria-label="Threat relationship controls">
      <div className="constellation-toolbar__primary">
        <button className="constellation-icon-button" type="button" aria-label="Relationship filters" aria-expanded={filtersOpen} data-active={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
          <Filter size={15} />
          <span className="constellation-filter-count">{filters.entityTypes.length + filters.edgeTypes.length}</span>
        </button>

        <form className="constellation-search" onSubmit={(event) => { event.preventDefault(); onFiltersChange({ searchQuery: searchValue.trim() || undefined, seedEntity: undefined }); }}>
          <Search size={14} />
          <input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Find an entity, IP, process, or domain" aria-label="Find entity in constellation" />
          {searchValue && <button type="button" aria-label="Clear entity search" onClick={() => { setSearchValue(''); onFiltersChange({ searchQuery: undefined, seedEntity: undefined }); }}><X size={13} /></button>}
        </form>

        <label className="constellation-select"><span>Window</span><select value={filters.timeRange} onChange={(event) => onFiltersChange({ timeRange: event.target.value })}><option value="1h">Last 1 hour</option><option value="4h">Last 4 hours</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
        <label className="constellation-select"><span>Hops</span><select value={filters.depth} onChange={(event) => onFiltersChange({ depth: Number(event.target.value) })}><option value={1}>1 hop</option><option value={2}>2 hops</option><option value={3}>3 hops</option></select></label>
        <label className="constellation-select"><span>Risk</span><select value={filters.minRisk ?? 0} onChange={(event) => onFiltersChange({ minRisk: Number(event.target.value) })}><option value={0}>All risk</option><option value={40}>40+</option><option value={60}>60+</option><option value={80}>80+</option></select></label>

        <div className="constellation-toolbar__view-controls" aria-label="Graph view controls">
          <button type="button" onClick={onTogglePaused} aria-label={paused ? 'Resume relationship flow' : 'Pause relationship flow'} aria-pressed={paused}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>
          <button type="button" onClick={onZoomOut} aria-label="Zoom out"><Minus size={14} /></button>
          <button type="button" onClick={onZoomIn} aria-label="Zoom in"><Plus size={14} /></button>
          <button type="button" onClick={onFitView} aria-label="Fit graph to view"><LocateFixed size={14} /></button>
          <button type="button" onClick={onToggleFocusMode} aria-label={focusMode ? 'Exit full graph view' : 'Enter full graph view'} aria-pressed={focusMode}>{focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
          <button type="button" onClick={onResetView} aria-label="Reset relationship workspace"><RotateCcw size={14} /></button>
        </div>
      </div>

      {filtersOpen && <div className="constellation-filter-panel">
        <div><strong>Entity types</strong><div className="constellation-filter-panel__chips">{ENTITY_TYPES.map((type) => <button key={type} type="button" aria-pressed={filters.entityTypes.includes(type)} onClick={() => toggleType(type)}><EntityTypeIcon type={type} size={13} />{entityTypeLabel(type)}</button>)}</div></div>
        <div><strong>Relationship evidence</strong><div className="constellation-filter-panel__chips">{EDGE_TYPES.map((edge) => <button key={edge.value} type="button" aria-pressed={filters.edgeTypes.includes(edge.value)} onClick={() => toggleEdge(edge.value)}>{edge.label}</button>)}</div></div>
      </div>}
    </section>
  );
}
