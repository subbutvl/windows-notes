import { useCallback, useEffect, useState } from "react";
import { InsertIcon, RestoreIcon } from "../components/Icons";
import { insertIntoNote, useTools, type Rates } from "../lib/tools";
import { IconAction, useCanInsert, type Copy } from "./shared";

const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee", locale: "en-IN" },
  { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US" },
  { code: "EUR", symbol: "€", name: "Euro", locale: "de-DE" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", locale: "en-SG" },
] as const;
type Code = (typeof CURRENCIES)[number]["code"];

// European Central Bank reference rates, published once a working day. Free, no key.
const RATES_URL = "https://api.frankfurter.dev/v1/latest?base=INR&symbols=USD,EUR,SGD";

async function fetchRates(): Promise<Rates> {
  const res = await fetch(RATES_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { date: string; rates: Record<string, number> };
  return { date: body.date, perInr: { INR: 1, ...body.rates } };
}

const round = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(2) : String(Number(v.toPrecision(6))));
const parse = (s: string) => Number(s.replace(/[,\s]/g, ""));

/**
 * Type in any row and the others follow. Rates are fetched when the tool
 * opens and kept in memory for this session only.
 */
export function CurrencyTool({ copy }: { copy: Copy }) {
  const canInsert = useCanInsert();
  const rates = useTools((s) => s.rates);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [source, setSource] = useState<{ code: Code; text: string }>({ code: "INR", text: "1000" });

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      useTools.setState({ rates: await fetchRates() });
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!useTools.getState().rates) load();
  }, [load]);

  const amount = parse(source.text);
  const valueIn = (code: Code) => {
    if (code === source.code) return source.text;
    if (!rates || !Number.isFinite(amount)) return "";
    return round((amount / rates.perInr[source.code]) * rates.perInr[code]);
  };

  const line = (code: Code) => {
    const c = CURRENCIES.find((x) => x.code === code)!;
    const v = parse(valueIn(code));
    return `${c.symbol}${v.toLocaleString(c.locale, { maximumFractionDigits: 2 })}`;
  };
  const summary = () => CURRENCIES.map((c) => line(c.code)).join(" = ");

  return (
    <div className="tool-body">
      <div className="currency-list">
        {CURRENCIES.map((c) => (
          <label key={c.code} className={`currency-row${source.code === c.code ? " is-source" : ""}`}>
            <span className="currency-code">
              <strong>{c.code}</strong>
              <small>{c.name}</small>
            </span>
            <span className="currency-input">
              <span aria-hidden="true">{c.symbol}</span>
              <input
                inputMode="decimal"
                aria-label={c.name}
                value={valueIn(c.code)}
                placeholder={rates ? "0" : "…"}
                disabled={!rates && c.code !== "INR"}
                onChange={(e) => setSource({ code: c.code, text: e.target.value })}
                onFocus={(e) => e.currentTarget.select()}
              />
            </span>
            <button className="tool-button small copy-value" title={`Copy ${c.code} amount`} onClick={(e) => (e.preventDefault(), copy(valueIn(c.code)))}>
              Copy
            </button>
          </label>
        ))}
      </div>

      {rates && (
        <div className="currency-rates">
          {CURRENCIES.filter((c) => c.code !== "INR").map((c) => (
            <div key={c.code}>
              1 {c.code} = ₹{(1 / rates.perInr[c.code]).toFixed(2)}
            </div>
          ))}
        </div>
      )}

      <div className="tool-actions spread">
        <span className="tool-hint">
          {status === "loading"
            ? "Getting today's rates…"
            : status === "error"
              ? "Couldn't get rates. Check the internet connection."
              : rates
                ? `ECB reference rates for ${rates.date}`
                : ""}
        </span>
        <IconAction label="Refresh rates" disabled={status === "loading"} onClick={load}>
          <RestoreIcon size={16} />
        </IconAction>
        <IconAction label="Insert conversion into note" disabled={!rates || !canInsert} onClick={() => insertIntoNote(summary())}>
          <InsertIcon size={16} />
        </IconAction>
      </div>
      <p className="tool-hint">Rates come from the European Central Bank and are kept in memory only. They're for reference; banks and cards add their own margins.</p>
    </div>
  );
}
