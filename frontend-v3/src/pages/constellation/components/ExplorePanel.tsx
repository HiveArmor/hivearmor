/**
 * ExplorePanel — seed type selector, value input, explore options, and Explore button.
 * CON-001 entry point for constellation exploration.
 */

import { useCallback, useState } from 'react';

import type { ExploreOptions, SeedDescriptor, SeedType } from '../types/constellation.types';

interface ExplorePanelProps {
  onExplore: (seed: SeedDescriptor, options: ExploreOptions) => void;
  isLoading: boolean;
}

const SEED_TYPE_OPTIONS: Array<{ value: SeedType; label: string }> = [
  { value: 'entity', label: 'Entity' },
  { value: 'query', label: 'Query' },
  { value: 'incident', label: 'Incident' },
  { value: 'alert', label: 'Alert' },
];

const ENTITY_TYPES = ['host', 'user', 'ip', 'process', 'file', 'domain'];

export function ExplorePanel({ onExplore, isLoading }: ExplorePanelProps): JSX.Element {
  const [seedType, setSeedType] = useState<SeedType>('entity');
  const [seedValue, setSeedValue] = useState('');
  const [hopDepth, setHopDepth] = useState(2);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [selectedEntityTypes, setSelectedEntityTypes] = useState<string[]>([]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!seedValue.trim()) return;

      const seed: SeedDescriptor = {
        type: seedType,
        value: seedValue.trim(),
      };

      const options: ExploreOptions = {
        hopDepth,
        nodeLimit: 200,
        edgeLimit: 500,
        confidenceThreshold,
        entityTypes: selectedEntityTypes.length > 0 ? selectedEntityTypes : undefined,
      };

      onExplore(seed, options);
    },
    [seedType, seedValue, hopDepth, confidenceThreshold, selectedEntityTypes, onExplore]
  );

  const toggleEntityType = (type: string) => {
    setSelectedEntityTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  return (
    <form className="ha-explore-panel" onSubmit={handleSubmit} aria-label="Constellation exploration">
      <h3 className="ha-explore-panel__title">Explore</h3>

      <div className="ha-explore-panel__field">
        <label htmlFor="seed-type">Seed type</label>
        <select
          id="seed-type"
          value={seedType}
          onChange={(e) => setSeedType(e.target.value as SeedType)}
        >
          {SEED_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="ha-explore-panel__field">
        <label htmlFor="seed-value">Value</label>
        <input
          id="seed-value"
          type="text"
          value={seedValue}
          onChange={(e) => setSeedValue(e.target.value)}
          placeholder={seedType === 'query' ? 'source.ip:203.0.113.*' : 'Entity ID or value'}
          autoComplete="off"
        />
      </div>

      <div className="ha-explore-panel__field">
        <label htmlFor="hop-depth">
          Hop depth: <strong>{hopDepth}</strong>
        </label>
        <input
          id="hop-depth"
          type="range"
          min={1}
          max={3}
          step={1}
          value={hopDepth}
          onChange={(e) => setHopDepth(Number(e.target.value))}
        />
      </div>

      <div className="ha-explore-panel__field">
        <label htmlFor="confidence">
          Confidence: <strong>{(confidenceThreshold * 100).toFixed(0)}%</strong>
        </label>
        <input
          id="confidence"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={confidenceThreshold}
          onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
        />
      </div>

      <fieldset className="ha-explore-panel__entity-types">
        <legend>Entity types</legend>
        <div className="ha-explore-panel__checkboxes">
          {ENTITY_TYPES.map((type) => (
            <label key={type} className="ha-explore-panel__checkbox">
              <input
                type="checkbox"
                checked={selectedEntityTypes.includes(type)}
                onChange={() => toggleEntityType(type)}
              />
              <span>{type}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        className="ha-explore-panel__submit"
        disabled={isLoading || !seedValue.trim()}
      >
        {isLoading ? 'Exploring…' : 'Explore'}
      </button>
    </form>
  );
}
