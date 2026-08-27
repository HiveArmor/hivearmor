import { useCallback, useEffect, useRef, useState } from 'react';

import { Calendar, ChevronDown, Clock } from 'lucide-react';

import { AbsoluteCalendarFields, parseLocalDatetime, toLocalDatetime } from './AbsoluteCalendarFields';
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
  return toLocalDatetime(new Date(iso));
}

function localDatetimeToIso(local: string): string {
  const parsed = parseLocalDatetime(local);
  if (!parsed) return '';
  return parsed.toISOString();
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
  const [absError, setAbsError] = useState<string | null>(null);
  const [relValue, setRelValue] = useState('4');
  const [relUnit, setRelUnit] = useState<string>('h');
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click (deferred so opening click cannot dismiss)
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const attachId = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      window.clearTimeout(attachId);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen]);

  // Initialize absolute inputs when opening Absolute tab
  useEffect(() => {
    if (view !== 'absolute') return;
    setAbsError(null);
    if (value.type === 'custom') {
      setAbsFrom(formatLocalDatetime(value.from));
      setAbsTo(formatLocalDatetime(value.to));
    } else {
      const now = new Date();
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
      setAbsFrom(toLocalDatetime(fourHoursAgo));
      setAbsTo(toLocalDatetime(now));
    }
  }, [view, value]);

  const handlePresetClick = (preset: TimeRangePreset) => {
    onChange({ type: 'preset', preset });
    setIsOpen(false);
  };

  const applyAbsolute = useCallback(() => {
    const fromParsed = parseLocalDatetime(absFrom);
    const toParsed = parseLocalDatetime(absTo);
    if (!fromParsed || !toParsed) {
      setAbsError('Select a valid From and To date/time.');
      return;
    }
    if (fromParsed.getTime() >= toParsed.getTime()) {
      setAbsError('From must be earlier than To.');
      return;
    }
    setAbsError(null);
    onChange({ type: 'custom', from: localDatetimeToIso(absFrom), to: localDatetimeToIso(absTo) });
    setIsOpen(false);
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
        <div
          className="ha-time-range__panel"
          role="dialog"
          aria-label="Select time range"
          data-view={view}
        >
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
              <AbsoluteCalendarFields
                from={absFrom}
                to={absTo}
                onFromChange={(next) => {
                  setAbsFrom(next);
                  setAbsError(null);
                }}
                onToChange={(next) => {
                  setAbsTo(next);
                  setAbsError(null);
                }}
              />
              {absError && <p className="ha-time-range__error" role="alert">{absError}</p>}
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
