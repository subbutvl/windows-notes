import { useEffect, useState } from "react";

const DAY = 86_400_000;
const HOURS_PER_WORKDAY = 8;

/** "2026-10-20" → days since 1970, so date maths ignores time zones and daylight saving. */
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
};
const isoOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const isoOfDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const isWeekday = (day: number) => {
  const dow = new Date(day * DAY).getUTCDay();
  return dow !== 0 && dow !== 6;
};
/** Monday to Friday days from `from` to `to`, both included. */
function workDays(from: number, to: number) {
  let n = 0;
  for (let d = from; d <= to; d++) if (isWeekday(d)) n++;
  return n;
}
const num = (v: number, digits = 0) => v.toLocaleString(undefined, { maximumFractionDigits: digits });
const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? "" : "s"}`;

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="date-row">
      <span>{label}</span>
      <strong>
        {value}
        {note && <small>{note}</small>}
      </strong>
    </div>
  );
}

/** Days between dates, and calendar and work hours in a month. Work days are Monday to Friday, 8 hours each. */
export function DateTool() {
  const [now, setNow] = useState(() => new Date());
  // Keeps "hours left this month" current while the tool is open.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const today = isoOf(now);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => isoOf(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())));
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState(today);

  // Days between
  const a = dayNumber(from);
  const b = dayNumber(to);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const between = hi - lo;

  // Month
  const [y, m] = month.split("-").map(Number);
  const first = Date.UTC(y, m - 1, 1) / DAY;
  const last = Date.UTC(y, m, 0) / DAY;
  const daysInMonth = last - first + 1;
  const monthStart = new Date(y, m - 1, 1).getTime();
  const monthEnd = new Date(y, m, 1).getTime();
  const hoursPassed = Math.min(Math.max(now.getTime() - monthStart, 0), monthEnd - monthStart) / 3_600_000;
  const hoursLeft = daysInMonth * 24 - hoursPassed;
  const pickedDay = Math.min(Math.max(dayNumber(day), first), last);
  const pickedLabel = new Date(pickedDay * DAY).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
  const totalWork = workDays(first, last);
  const workToDay = workDays(first, pickedDay);
  const workFromDay = workDays(pickedDay, last);
  const monthName = new Date(monthStart).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="tool-body">
      <section className="date-section">
        <h3>Days Between Two Dates</h3>
        <div className="date-inputs">
          <input type="date" className="tool-input" aria-label="From" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <span>to</span>
          <input type="date" className="tool-input" aria-label="To" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
        <Row label="Days between" value={plural(between, "day")} note={between >= 7 ? `${Math.floor(between / 7)} wk ${between % 7} d` : undefined} />
        <Row label="Counting both days" value={plural(between + 1, "day")} />
        <Row label="Work days (Mon–Fri)" value={plural(workDays(lo, hi), "day")} note={`${num(workDays(lo, hi) * HOURS_PER_WORKDAY)} h`} />
      </section>

      <section className="date-section">
        <h3>Month</h3>
        <div className="date-inputs">
          <input
            type="month"
            className="tool-input"
            aria-label="Month"
            value={month}
            onChange={(e) => {
              if (!e.target.value) return;
              setMonth(e.target.value);
              setDay(e.target.value === today.slice(0, 7) ? today : `${e.target.value}-01`);
            }}
          />
          <button className="text-button" disabled={month === today.slice(0, 7) && day === today} onClick={() => (setMonth(today.slice(0, 7)), setDay(today))}>
            This Month
          </button>
        </div>
        <Row label={`Days in ${monthName}`} value={plural(daysInMonth, "day")} note={`${num(daysInMonth * 24)} h`} />
        <Row label="Hours since the month began" value={`${num(hoursPassed, 1)} h`} />
        <Row label="Hours left in the month" value={`${num(hoursLeft, 1)} h`} />
        <Row label="Work days in the month" value={plural(totalWork, "day")} note={`${num(totalWork * HOURS_PER_WORKDAY)} h`} />
      </section>

      <section className="date-section">
        <h3>Work Hours Around a Day</h3>
        <div className="date-inputs">
          <input
            type="date"
            className="tool-input"
            aria-label="Day"
            min={`${month}-01`}
            max={isoOf(new Date(y, m, 0))}
            value={isoOfDay(pickedDay)}
            onChange={(e) => e.target.value && (setDay(e.target.value), setMonth(e.target.value.slice(0, 7)))}
          />
          <button className="text-button" disabled={day === today} onClick={() => (setMonth(today.slice(0, 7)), setDay(today))}>
            Today
          </button>
        </div>
        <Row label={`Month start to ${pickedLabel}`} value={plural(workToDay, "work day")} note={`${num(workToDay * HOURS_PER_WORKDAY)} h`} />
        <Row label={`${pickedLabel} to month end`} value={plural(workFromDay, "work day")} note={`${num(workFromDay * HOURS_PER_WORKDAY)} h`} />
      </section>
      <p className="tool-hint">Work days are Monday to Friday at {HOURS_PER_WORKDAY} hours a day; both ends are counted. Public holidays aren't taken out.</p>
    </div>
  );
}
