import { useCallback, useEffect, useRef, useState } from 'react';

import { Calendar, ChevronDown, Clock } from 'lucide-react';

import { ALL_PRESETS, PRESET_LABELS, getTimeRangeLabel } from './timeRangeUtils';
import type { TimeRange, TimeRangePreset } from './timeRangeUtils';

import './TimeRangeSelector.css';

export interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  presets?: TimeRangePreset[];
  disabled?: boolean;
}

type PanelView = 'presets' | 'absolute' | 'relative';

const RELATIVE_UNITS = [
  { value: 'm', label: 'Minutes' },
  { value: 'h', label: 'Hours' },
  { value: 'd', label: 'Days' },
  { value: 'w', label: 'Weeks' },
] as const;

function formatLocalDatetime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDatetimeToIso(local: string): string {
  if (!local) return '';
  return new Date(local).toISOString();
}

export function TimeRangeSelector({
  value,
  onChange,
  presets = ALL_PRESETS,
  disabled = false,
}: TimeRangeSelectorProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<PanelView>('presets');
  const [absFrom, setAbsFrom] = useState('');
  const [absTo, setAbsTo] = useState('');
  const [relValue, setRelValue] = useState('4');
  const [relUnit, setRelUnit] = useState<string>('h');
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Initialize absolute inputs when opening custom view
  useEffect(() => {
    if (view === 'absolute') {
      if (value.type === 'custom') {
        setAbsFrom(formatLocalDatetime(value.from));
        setAbsTo(formatLocalDatetime(value.to));
      } else {
        const now = new Date();
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        setAbsFrom(formatLocalDatetime(fourHoursAgo.toISOString()));
        setAbsTo(formatLocalDatetime(now.toISOString()));
      }
    }
  }, [view, value]);

  const handlePresetClick = (preset: TimeRangePreset) => {
    onChange({ type: 'preset', preset });
    setIsOpen(false);
  };

  const applyAbsolute = useCallback(() => {
    if (absFrom && absTo) {
      onChange({ type: 'custom', from: localDatetimeToIso(absFrom), to: localDatetimeToIso(absTo) });
      setIsOpen(false);
    }
  }, [absFrom, absTo, onChange]);

  const applyRelative = useCallback(() => {
    const num = parseInt(relValue, 10);
    if (isNaN(num) || num <= 0) return;
    const msMap: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
    const ms = num * (msMap[relUnit] ?? 3_600_000);
    const now = new Date();
    onChange({ type: 'custom', from: new Date(now.getTime() - ms).toISOString(), to: now.toISOString() });
    setIsOpen(false);
  }, [relValue, relUnit, onChange]);

  return (
    <div className="ha-time-range" ref={panelRef}>
      <button
        type="button"
        className="ha-time-range__trigger"
        onClick={() => { setIsOpen(!isOpen); setView('presets'); }}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Time range selector"
      >
        <Calendar size={14} aria-hidden="true" />
        <span>{getTimeRangeLabel(value)}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {isOpen && !disabled && (
        <div className="ha-time-range__panel" role="dialog" aria-label="Select time range">
          <nav className="ha-time-range__tabs" aria-label="Time range type">
            <button type="button" data-active={view === 'presets' || undefined} onClick={() => setView('presets')}>
              <Clock size={13} /> Quick
            </button>
            <button type="button" data-active={view === 'relative' || undefined} onClick={() => setView('relative')}>
              <Clock size={13} /> Relative
            </button>
            <button type="button" data-active={view === 'absolute' || undefined} onClick={() => setView('absolute')}>
              <Calendar size={13} /> Absolute
            </button>
          </nav>

          {view === 'presets' && (
            <div className="ha-time-range__presets">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="ha-time-range__preset"
                  data-selected={value.type === 'preset' && value.preset === preset || undefined}
                  onClick={() => handlePresetClick(preset)}
                >
                  {PRESET_LABELS[preset]}
                </button>
              ))}
            </div>
          )}

          {view === 'relative' && (
            <div className="ha-time-range__relative">
              <p>Show events from the last:</p>
              <div className="ha-time-range__relative-inputs">
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={relValue}
                  onChange={(e) => setRelValue(e.target.value)}
                  aria-label="Relative time value"
                />
                <select
                  value={relUnit}
                  onChange={(e) => setRelUnit(e.target.value)}
                  aria-label="Relative time unit"
                >
                  {RELATIVE_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="ha-time-range__apply" onClick={applyRelative}>
                Apply
              </button>
            </div>
          )}

          {view === 'absolute' && (
            <div className="ha-time-range__absolute">
              <label>
                <span>From</span>
                <input
                  type="text"
                  value={absFrom}
                  onChange={(e) => setAbsFrom(e.target.value)}
                  placeholder="2026-08-04T10:00"
                  aria-label="Start date and time (YYYY-MM-DDTHH:MM)"
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="text"
                  value={absTo}
                  onChange={(e) => setAbsTo(e.target.value)}
                  placeholder="2026-08-04T14:00"
                  aria-label="End date and time (YYYY-MM-DDTHH:MM)"
                />
              </label>
              <small className="ha-time-range__hint">Format: YYYY-MM-DDTHH:MM (local time)</small>
              <button
                type="button"
                className="ha-time-range__apply"
                onClick={applyAbsolute}
                disabled={!absFrom || !absTo}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
