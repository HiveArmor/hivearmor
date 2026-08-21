/**
 * EntityPreviewPopover — hover-triggered popover wrapping EntityPreviewCard.
 * Fetches entity preview on hover with 300ms debounce to avoid unnecessary requests.
 */

import { useCallback, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { EntityPreviewCard } from './EntityPreviewCard';
import { getEntityPreview } from '../services/entity.service';


import './EntityPreviewPopover.css';

interface EntityPreviewPopoverProps {
  entityId: string;
  children: React.ReactNode;
}

const HOVER_DELAY_MS = 300;

export function EntityPreviewPopover({ entityId, children }: EntityPreviewPopoverProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewQuery = useQuery({
    queryKey: ['entity-preview', entityId],
    queryFn: ({ signal }) => getEntityPreview(entityId, signal),
    enabled: shouldFetch,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const handleMouseEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    hoverTimerRef.current = setTimeout(() => {
      setShouldFetch(true);
      setIsOpen(true);
    }, HOVER_DELAY_MS);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, []);

  return (
    <div
      className="ent-preview-popover"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="ent-preview-popover__trigger">
        {children}
      </div>

      {isOpen && (
        <div
          className="ent-preview-popover__content"
          role="tooltip"
          aria-label={`Entity preview for ${entityId}`}
          onMouseEnter={() => {
            if (closeTimerRef.current) {
              clearTimeout(closeTimerRef.current);
              closeTimerRef.current = null;
            }
          }}
          onMouseLeave={handleMouseLeave}
        >
          {previewQuery.isLoading && (
            <div className="ent-preview-popover__loading">
              <span>Loading preview…</span>
            </div>
          )}
          {previewQuery.isError && (
            <div className="ent-preview-popover__error">
              <span>Preview unavailable</span>
            </div>
          )}
          {previewQuery.data && (
            <EntityPreviewCard entity={previewQuery.data.entity} />
          )}
        </div>
      )}
    </div>
  );
}
