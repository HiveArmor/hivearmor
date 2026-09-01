/**
 * FieldSelectorPopover — optional column selector for AG Grid.
 * Refactored onto HaPopover (C1): the open/close/click-outside/Escape/focus/positioning shell now
 * lives in the primitive; this component only supplies the trigger and the column checklist.
 */

import type { ColDef } from 'ag-grid-community';
import { Columns } from 'lucide-react';

import { HaPopover } from '@/components/ha-popover';

import './FieldSelectorPopover.css';

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
  return (
    <HaPopover
      ariaLabel="Select columns"
      placement="bottom-end"
      width={240}
      trigger={
        <button type="button" className="field-selector__trigger" aria-label="Select columns" title="Select columns">
          <Columns size={14} aria-hidden="true" />
          Fields
        </button>
      }
    >
      <div className="field-selector__header">Optional Columns</div>
      <div className="field-selector__list">
        {optionalColumns.map((col) => {
          const colId = col.colId ?? col.field ?? '';
          const isChecked = selectedColIds.includes(colId);
          return (
            <label key={colId} className="field-selector__item">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleColumn(colId)}
              />
              <span>{col.headerName ?? colId}</span>
            </label>
          );
        })}
      </div>
    </HaPopover>
  );
}
