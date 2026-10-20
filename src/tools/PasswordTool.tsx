import { useCallback, useEffect, useState } from "react";
import { CopyIcon, InsertIcon, RestoreIcon } from "../components/Icons";
import { insertIntoNote } from "../lib/tools";
import { IconAction, useCanInsert, type Copy } from "./shared";

const SETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/~",
};
type SetName = keyof typeof SETS;
const LOOK_ALIKES = /[Il1O0o]/g;

/** A uniformly random index below `max`, from the OS's secure random source. */
function randomIndex(max: number): number {
  const buf = new Uint32Array(1);
  // Reject the top sliver so every index is equally likely.
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

function generate(length: number, sets: SetName[], avoidLookAlikes: boolean): string {
  const pools = sets.map((s) => (avoidLookAlikes ? SETS[s].replace(LOOK_ALIKES, "") : SETS[s]));
  const all = pools.join("");
  // One character from each chosen set, the rest from all of them, then shuffle.
  const chars = pools.map((p) => p[randomIndex(p.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function strength(length: number, poolSize: number) {
  const bits = Math.round(length * Math.log2(poolSize));
  if (bits < 50) return { bits, label: "Weak", level: 1 };
  if (bits < 80) return { bits, label: "Fair", level: 2 };
  if (bits < 110) return { bits, label: "Strong", level: 3 };
  return { bits, label: "Very strong", level: 4 };
}

const LABELS: Record<SetName, string> = { upper: "A–Z", lower: "a–z", digits: "0–9", symbols: "!@#" };

/** Passwords are never kept: not in history, not in the clipboard list, not on disk. */
export function PasswordTool({ copy }: { copy: Copy }) {
  const canInsert = useCanInsert();
  const [length, setLength] = useState(16);
  const [sets, setSets] = useState<SetName[]>(["upper", "lower", "digits", "symbols"]);
  const [avoid, setAvoid] = useState(true);
  const [password, setPassword] = useState("");

  const regenerate = useCallback(() => setPassword(sets.length ? generate(length, sets, avoid) : ""), [length, sets, avoid]);
  useEffect(regenerate, [regenerate]);

  const pool = sets.reduce((n, s) => n + (avoid ? SETS[s].replace(LOOK_ALIKES, "") : SETS[s]).length, 0);
  const st = pool ? strength(length, pool) : null;
  const toggle = (s: SetName) => setSets((cur) => (cur.includes(s) ? (cur.length > 1 ? cur.filter((x) => x !== s) : cur) : [...cur, s]));

  return (
    <div className="tool-body">
      <div className="password-box">
        <output className="password-value" aria-live="polite">
          {password}
        </output>
        <div className="tool-actions">
          <span className={`password-strength level-${st?.level ?? 0}`}>{st ? `${st.label} · ${st.bits} bits` : ""}</span>
          <IconAction label="New password" onClick={regenerate}>
            <RestoreIcon size={16} />
          </IconAction>
          <IconAction label="Copy password" onClick={() => copy(password, "password", true)}>
            <CopyIcon size={16} />
          </IconAction>
          <IconAction label="Insert password into note" disabled={!canInsert} onClick={() => insertIntoNote(password)}>
            <InsertIcon size={16} />
          </IconAction>
        </div>
      </div>

      <label className="tool-field">
        <span>
          Length <strong>{length}</strong>
        </span>
        <input type="range" min={8} max={64} value={length} onChange={(e) => setLength(Number(e.target.value))} />
      </label>

      <div className="chip-row" role="group" aria-label="Characters to use">
        {(Object.keys(SETS) as SetName[]).map((s) => (
          <button key={s} className={`chip${sets.includes(s) ? " is-on" : ""}`} aria-pressed={sets.includes(s)} onClick={() => toggle(s)}>
            {LABELS[s]}
          </button>
        ))}
      </div>
      <label className="tool-check">
        <input type="checkbox" checked={avoid} onChange={(e) => setAvoid(e.target.checked)} />
        Avoid look-alike characters (I, l, 1, O, 0)
      </label>
      <p className="tool-hint">Made on this PC with the system's secure random generator; nothing is sent anywhere. Copied passwords are left out of the clipboard history.</p>
    </div>
  );
}
