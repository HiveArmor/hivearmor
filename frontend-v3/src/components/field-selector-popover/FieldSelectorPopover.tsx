/**
 * FieldSelectorPopover — Optional column selector for AG Grid
 */

import { useState, useRef, useEffect } from 'react';

import type { ColDef } from 'ag-grid-community';
import { Columns } from 'lucide-react';

export interface FieldSelectorPopoverProps {
  optionalColumns: ColDef[];
  selectedColIds: string[];
  onToggleColumn: (colId: string) => void;
}

export function FieldSelectorPopover({
  optionalColumns,
  selectedColIds,
  onToggleColumn,
}: FieldSelectorPopoverProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: 28,
          padding: '0 10px',
          background: 'var(--ha-surface-raised)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          color: 'var(--ha-text-primary)',
          fontSize: 'var(--ha-text-sm)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
        aria-label="Select columns"
        title="Select columns"
      >
        <Columns size={14} />
        Fields
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 32,
            right: 0,
            width: 240,
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-md)',
            boxShadow: 'var(--ha-shadow-control)',
            padding: '8px 0',
            zIndex: 100,
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
              fontWeight: 600,
              borderBottom: '1px solid var(--ha-border)',
            }}
          >
            Optional Columns
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {optionalColumns.map((col) => {
              const colId = col.colId ?? col.field ?? '';
              const isChecked = selectedColIds.includes(colId);

              return (
                <label
                  key={colId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: 'var(--ha-text-sm)',
                    color: 'var(--ha-text-primary)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--ha-surface-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleColumn(colId)}
                    style={{
                      width: 16,
                      height: 16,
                      cursor: 'pointer',
                    }}
                  />
                  <span>{col.headerName ?? colId}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
