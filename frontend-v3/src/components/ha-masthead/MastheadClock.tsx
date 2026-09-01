/**
 * MastheadClock — live clock + timezone label in the masthead (design system C3).
 *
 * Locked spec: mono font, tabular-nums, a tz label, UTC by default. SOC analysts correlate events
 * in UTC; showing the tz explicitly avoids the "whose local time?" ambiguity. Sits left of the
 * live EPS badge. Ticks once per second; cleans up on unmount.
 */
import { useEffect, useState } from 'react';

function utcTime(): string {
  return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

export function MastheadClock(): JSX.Element {
  const [time, setTime] = useState(utcTime);

  useEffect(() => {
    const id = window.setInterval(() => setTime(utcTime()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="ha-masthead__clock" title="Current time (UTC)">
      <span className="ha-masthead__clock-time">{time}</span>
      <span className="ha-masthead__clock-tz">UTC</span>
    </div>
  );
}
