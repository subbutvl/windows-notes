import { useMemo, useRef, useState } from "react";
import { CopyIcon, InsertIcon } from "../components/Icons";
import { evaluate, formatNumber } from "../lib/calc";
import { openContextMenu } from "../lib/menu";
import { insertIntoNote, useTools } from "../lib/tools";
import { IconAction, useCanInsert, type Copy } from "./shared";

const KEYPAD = ["C", "⌫", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "(", "0", ".", ")", "√", "^", "π", "="];
const OPERATORS = new Set(["÷", "×", "−", "+", "^", "%"]);

export function Calculator({ copy }: { copy: Copy }) {
  const history = useTools((s) => s.calcHistory);
  const canInsert = useCanInsert();
  const [expr, setExpr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => {
    try {
      return formatNumber(evaluate(expr));
    } catch {
      return null;
    }
  }, [expr]);

  const commit = () => {
    if (preview === null) return;
    useTools.setState((s) => ({ calcHistory: [{ expr, result: preview }, ...s.calcHistory].slice(0, 30) }));
    setExpr(preview);
  };

  const press = (key: string) => {
    if (key === "C") setExpr("");
    else if (key === "⌫") setExpr((e) => e.slice(0, -1));
    else if (key === "=") commit();
    else if (key === "√") setExpr((e) => `${e}√(`);
    else setExpr((e) => e + (OPERATORS.has(key) ? ` ${key} ` : key));
    input.current?.focus();
  };

  return (
    <div className="tool-body">
      <div className="calc-display">
        <input
          ref={input}
          className="calc-input"
          aria-label="Expression"
          placeholder="0"
          value={expr}
          autoFocus
          spellCheck={false}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "=") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape" && expr) {
              e.stopPropagation();
              setExpr("");
            }
          }}
        />
        <div className={`calc-result${preview === null && expr ? " is-error" : ""}`} aria-live="polite">
          {expr ? (preview ?? "…") : " "}
        </div>
        <div className="tool-actions">
          <IconAction label="Copy result" disabled={preview === null} onClick={() => preview !== null && copy(preview)}>
            <CopyIcon size={16} />
          </IconAction>
          <IconAction label="Insert result into note" disabled={preview === null || !canInsert} onClick={() => preview !== null && insertIntoNote(preview)}>
            <InsertIcon size={16} />
          </IconAction>
        </div>
      </div>

      <div className="calc-keypad">
        {KEYPAD.map((k) => (
          <button
            key={k}
            className={`calc-key${OPERATORS.has(k) ? " is-op" : ""}${k === "=" ? " is-equals" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <section className="tool-section">
          <div className="tool-section-head">
            <h3>History</h3>
            <button className="link-button" onClick={() => useTools.setState({ calcHistory: [] })}>
              Clear
            </button>
          </div>
          <ul className="calc-history">
            {history.map((h, i) => (
              <li key={i}>
                <button
                  className="calc-history-row"
                  title="Use this result"
                  onClick={() => setExpr(h.result)}
                  onContextMenu={(e) =>
                    openContextMenu(e, [
                      { label: "Copy Result", onSelect: () => copy(h.result) },
                      { label: "Copy Calculation", onSelect: () => copy(`${h.expr} = ${h.result}`) },
                      { label: "Insert into Note", disabled: !canInsert, onSelect: () => insertIntoNote(`${h.expr} = ${h.result}`) },
                    ])
                  }
                >
                  <span className="calc-history-expr">{h.expr} =</span>
                  <span className="calc-history-result">{h.result}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
