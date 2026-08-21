/**
 * EventSearchPanel — Query input, entity filter chips, results table with pagination, pivot buttons.
 */

import { useCallback, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

import { searchIncidentEvents } from '../services/incident-workbench.service';
import type {
  EventSearchResult,
  IncidentEventSearchRequest,
  IncidentEventSearchResponse,
} from '../types/incident-workbench.types';

export interface EventSearchPanelProps {
  incidentId: string;
  linkedEntities?: string[];
}

export function EventSearchPanel({ incidentId, linkedEntities = [] }: EventSearchPanelProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [selectedEntities, setSelectedEntities] = useState<string[]>(linkedEntities.slice(0, 5));
  const [cursor, setCursor] = useState<unknown[] | null>(null);
  const [results, setResults] = useState<IncidentEventSearchResponse | null>(null);

  const searchMutation = useMutation({
    mutationFn: (body: IncidentEventSearchRequest) => searchIncidentEvents(incidentId, body),
    onSuccess: (data) => {
      setResults(data);
    },
  });

  const executeSearch = useCallback(
    (nextCursor?: unknown[]) => {
      const body: IncidentEventSearchRequest = {
        query: query.trim() || '*',
        entities: selectedEntities.length > 0 ? selectedEntities : undefined,
        limit: 50,
        cursor: nextCursor ?? undefined,
      };
      setCursor(nextCursor ?? null);
      searchMutation.mutate(body);
    },
    [query, selectedEntities, searchMutation]
  );

  const toggleEntity = useCallback((entity: string) => {
    setSelectedEntities((prev) =>
      prev.includes(entity) ? prev.filter((e) => e !== entity) : [...prev, entity]
    );
  }, []);

  const handlePivot = useCallback(
    (value: string) => {
      setQuery(value);
      const body: IncidentEventSearchRequest = {
        query: value,
        entities: selectedEntities.length > 0 ? selectedEntities : undefined,
        limit: 50,
      };
      searchMutation.mutate(body);
    },
    [selectedEntities, searchMutation]
  );

  return (
    <section className="event-search-panel" aria-label="Incident event search">
      <h2 className="event-search-panel__title">
        <Search size={15} aria-hidden="true" /> Event Search
      </h2>

      <form
        className="event-search-panel__form"
        onSubmit={(e) => {
          e.preventDefault();
          executeSearch();
        }}
      >
        <input
          className="event-search-panel__input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events (e.g. process.name:powershell.exe)"
          aria-label="Event search query"
        />
        <button
          className="event-search-panel__search-btn"
          type="submit"
          disabled={searchMutation.isPending}
        >
          {searchMutation.isPending ? 'Searching…' : 'Search'}
        </button>
      </form>

      {linkedEntities.length > 0 && (
        <div className="event-search-panel__chips" role="group" aria-label="Entity filters">
          {linkedEntities.map((entity) => (
            <button
              className="event-search-panel__chip"
              type="button"
              key={entity}
              data-selected={String(selectedEntities.includes(entity))}
              onClick={() => toggleEntity(entity)}
              aria-pressed={selectedEntities.includes(entity)}
            >
              {entity}
              {selectedEntities.includes(entity) && <X size={10} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}

      {searchMutation.isError && (
        <div className="event-search-panel__error" role="alert">
          Search failed. Please try a different query.
        </div>
      )}

      {results && (
        <div className="event-search-panel__results">
          <div className="event-search-panel__meta">
            <span>{results.total.toLocaleString()} event{results.total === 1 ? '' : 's'} found</span>
            {results.truncated && <span className="event-search-panel__truncated">Results truncated at 10,000</span>}
          </div>

          <div className="event-search-panel__table-wrapper">
            <table className="event-search-panel__table" aria-label="Search results">
              <thead>
                <tr>
                  {results.items.length > 0 &&
                    Object.keys(results.items[0]).map((key) => (
                      <th key={key}>{key}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {results.items.map((row: EventSearchResult, idx) => (
                  <tr key={idx}>
                    {Object.entries(row).map(([key, value]) => (
                      <td key={key}>
                        <button
                          className="event-search-panel__pivot-btn"
                          type="button"
                          onClick={() => handlePivot(`${key}:${String(value)}`)}
                          title={`Pivot on ${key}:${String(value)}`}
                        >
                          {String(value)}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="event-search-panel__pagination">
            <button
              className="event-search-panel__page-btn"
              type="button"
              disabled={!cursor}
              onClick={() => executeSearch()}
              aria-label="First page"
            >
              <ChevronLeft size={14} aria-hidden="true" /> First
            </button>
            <button
              className="event-search-panel__page-btn"
              type="button"
              disabled={!results.cursor}
              onClick={() => executeSearch(results.cursor ?? undefined)}
              aria-label="Next page"
            >
              Next <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
