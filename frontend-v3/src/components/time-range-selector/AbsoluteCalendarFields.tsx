/**
 * Absolute calendar + time fields for TimeRangeSelector Absolute tab.
 * No third-party date library — month grid + hour/minute inputs.
 */

import { useMemo, useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local `YYYY-MM-DDTHH:mm` helpers */
export function parseLocalDatetime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toLocalDatetime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function withDateKeepTime(base: Date, year: number, month: number, day: number): Date {
  return new Date(year, month, day, base.getHours(), base.getMinutes(), 0, 0);
}

function withTimeKeepDate(base: Date, hours: number, minutes: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes, 0, 0);
}

export interface AbsoluteCalendarFieldsProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

export function AbsoluteCalendarFields({
  from,
  to,
  onFromChange,
  onToChange,
}: AbsoluteCalendarFieldsProps): JSX.Element {
  const fromDate = parseLocalDatetime(from) ?? new Date();
  const toDate = parseLocalDatetime(to) ?? new Date();
  const [activeField, setActiveField] = useState<'from' | 'to'>('from');
  const [cursor, setCursor] = useState(() => startOfMonth(fromDate));

  const activeDate = activeField === 'from' ? fromDate : toDate;

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const count = daysInMonth(year, month);
    const slots: Array<{ day: number; date: Date } | null> = [];
    for (let i = 0; i < firstDow; i += 1) slots.push(null);
    for (let day = 1; day <= count; day += 1) {
      slots.push({ day, date: new Date(year, month, day) });
    }
    while (slots.length % 7 !== 0) slots.push(null);
    return slots;
  }, [cursor]);

  const monthLabel = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const selectDay = (dayDate: Date): void => {
    if (activeField === 'from') {
      const next = withDateKeepTime(fromDate, dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());
      onFromChange(toLocalDatetime(next));
      // After picking From, move focus to To for a natural range flow
      setActiveField('to');
      setCursor(startOfMonth(toDate));
    } else {
      const next = withDateKeepTime(toDate, dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate());
      onToChange(toLocalDatetime(next));
    }
  };

  const setHours = (field: 'from' | 'to', hoursRaw: string): void => {
    const hours = Math.min(23, Math.max(0, Number.parseInt(hoursRaw, 10) || 0));
    if (field === 'from') {
      onFromChange(toLocalDatetime(withTimeKeepDate(fromDate, hours, fromDate.getMinutes())));
    } else {
      onToChange(toLocalDatetime(withTimeKeepDate(toDate, hours, toDate.getMinutes())));
    }
  };

  const setMinutes = (field: 'from' | 'to', minutesRaw: string): void => {
    const minutes = Math.min(59, Math.max(0, Number.parseInt(minutesRaw, 10) || 0));
    if (field === 'from') {
      onFromChange(toLocalDatetime(withTimeKeepDate(fromDate, fromDate.getHours(), minutes)));
    } else {
      onToChange(toLocalDatetime(withTimeKeepDate(toDate, toDate.getHours(), minutes)));
    }
  };

  const inRange = (dayDate: Date): boolean => {
    const start = Math.min(fromDate.getTime(), toDate.getTime());
    const end = Math.max(fromDate.getTime(), toDate.getTime());
    const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()).getTime();
    return dayStart >= new Date(new Date(start).setHours(0, 0, 0, 0)).getTime()
      && dayStart <= new Date(new Date(end).setHours(0, 0, 0, 0)).getTime();
  };

  return (
    <div className="ha-time-range__calendar">
      <div className="ha-time-range__field-tabs" role="tablist" aria-label="Absolute bound">
        <button
          type="button"
          role="tab"
          aria-selected={activeField === 'from'}
          data-active={activeField === 'from' || undefined}
          onClick={() => {
            setActiveField('from');
            setCursor(startOfMonth(fromDate));
          }}
        >
          <span>From</span>
          <strong>{fromDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeField === 'to'}
          data-active={activeField === 'to' || undefined}
          onClick={() => {
            setActiveField('to');
            setCursor(startOfMonth(toDate));
          }}
        >
          <span>To</span>
          <strong>{toDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
        </button>
      </div>

      <div className="ha-time-range__month-nav">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        >
          <ChevronLeft size={14} />
        </button>
        <strong>{monthLabel}</strong>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="ha-time-range__weekday-row" aria-hidden="true">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>

      <div className="ha-time-range__day-grid" role="grid" aria-label={`${monthLabel} calendar`}>
        {cells.map((cell, index) => {
          if (!cell) {
            return <span key={`empty-${index}`} className="ha-time-range__day ha-time-range__day--empty" />;
          }
          const isFrom = sameDay(cell.date, fromDate);
          const isTo = sameDay(cell.date, toDate);
          const isActive = sameDay(cell.date, activeDate);
          const ranged = inRange(cell.date);
          return (
            <button
              key={cell.date.toISOString()}
              type="button"
              role="gridcell"
              className="ha-time-range__day"
              data-from={isFrom || undefined}
              data-to={isTo || undefined}
              data-active={isActive || undefined}
              data-range={ranged || undefined}
              aria-label={cell.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              aria-pressed={isActive}
              onClick={() => selectDay(cell.date)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div className="ha-time-range__time-row">
        <span>{activeField === 'from' ? 'From time' : 'To time'}</span>
        <div>
          <input
            type="number"
            min={0}
            max={23}
            value={pad(activeDate.getHours())}
            onChange={(event) => setHours(activeField, event.target.value)}
            aria-label={`${activeField === 'from' ? 'Start' : 'End'} hour`}
          />
          <span>:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={pad(activeDate.getMinutes())}
            onChange={(event) => setMinutes(activeField, event.target.value)}
            aria-label={`${activeField === 'from' ? 'Start' : 'End'} minute`}
          />
        </div>
      </div>
    </div>
  );
}
