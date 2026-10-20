import { useEffect, useState } from "react";

/** Fixed favourites. US covers every main US time zone. */
const ZONES: { label: string; zone: string }[] = [
  { label: "India", zone: "Asia/Kolkata" },
  { label: "Bahrain", zone: "Asia/Bahrain" },
  { label: "Singapore", zone: "Asia/Singapore" },
  { label: "US Eastern · New York", zone: "America/New_York" },
  { label: "US Central · Chicago", zone: "America/Chicago" },
  { label: "US Mountain · Denver", zone: "America/Denver" },
  { label: "US Arizona · Phoenix", zone: "America/Phoenix" },
  { label: "US Pacific · Los Angeles", zone: "America/Los_Angeles" },
  { label: "US Alaska · Anchorage", zone: "America/Anchorage" },
  { label: "US Hawaii · Honolulu", zone: "Pacific/Honolulu" },
];

const parts = (date: Date, zone: string) => {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "short", timeZoneName: "short" });
  return Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
};

/** Minutes this zone is ahead of UTC right now. */
function offsetMinutes(date: Date, zone: string) {
  const p = parts(date, zone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

const signed = (minutes: number) => {
  if (minutes === 0) return "same time";
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return `${minutes > 0 ? "+" : "−"}${h}h${m ? ` ${m}m` : ""}`;
};

/** Live world clock for a fixed list of places. Only ticks while open. */
export function ClockTool() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Tick on the minute boundary, then every minute.
    let timer = window.setTimeout(function tick() {
      setNow(new Date());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 20);
    }, 60_000 - (Date.now() % 60_000) + 20);
    return () => window.clearTimeout(timer);
  }, []);

  const localOffset = -now.getTimezoneOffset();
  const localDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="tool-body">
      <div className="clock-list">
        {ZONES.map(({ label, zone }) => {
          const p = parts(now, zone);
          const hour = +p.hour;
          const day = Date.UTC(+p.year, +p.month - 1, +p.day);
          const dayWord = day > localDay ? "Tomorrow" : day < localDay ? "Yesterday" : "Today";
          const working = p.weekday !== "Sat" && p.weekday !== "Sun" && hour >= 9 && hour < 18;
          const time = now.toLocaleTimeString(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" });
          return (
            <div key={zone} className="clock-row">
              <span className={`clock-dot${working ? " is-working" : hour >= 7 && hour < 21 ? " is-day" : ""}`} title={working ? "Working hours" : hour >= 7 && hour < 21 ? "Daytime" : "Night"} />
              <div className="clock-place">
                <strong>{label}</strong>
                <span>
                  {dayWord}, {p.weekday} · {p.timeZoneName} · {signed(offsetMinutes(now, zone) - localOffset)}
                </span>
              </div>
              <span className="clock-time">{time}</span>
            </div>
          );
        })}
      </div>
      <p className="tool-hint">Green: weekday 9 to 6 there. Amber: daytime. Grey: night. Differences are from your PC's time zone and follow daylight saving.</p>
    </div>
  );
}
