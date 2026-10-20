import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

const DELAYS = [0, 3, 5];

/**
 * Starts Windows' own Snip & Sketch overlay (the same as Win+Shift+S), so the
 * app holds no screenshots and uses no extra memory. The snip goes to the
 * Windows clipboard, ready to paste into any app.
 */
export function SnipTool() {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearInterval(timer.current), []);

  const snip = (delay: number) => {
    setError(null);
    window.clearInterval(timer.current);
    const start = () => {
      setCountdown(null);
      api.startScreenSnip().catch((e) => setError(String(e)));
    };
    if (!delay) return start();
    let left = delay;
    setCountdown(left);
    timer.current = window.setInterval(() => {
      left -= 1;
      if (left > 0) setCountdown(left);
      else {
        window.clearInterval(timer.current);
        start();
      }
    }, 1000);
  };

  return (
    <div className="tool-body">
      <div className="snip-buttons">
        {DELAYS.map((d) => (
          <button key={d} className={`text-button${d === 0 ? " primary" : ""}`} disabled={countdown !== null} onClick={() => snip(d)}>
            {d === 0 ? "Snip now" : `In ${d} seconds`}
          </button>
        ))}
      </div>
      {countdown !== null && (
        <p className="snip-countdown" aria-live="assertive">
          Snipping in {countdown}…{" "}
          <button className="link-button" onClick={() => (window.clearInterval(timer.current), setCountdown(null))}>
            Cancel
          </button>
        </p>
      )}
      {error && <p className="tool-hint is-error">{error}</p>}
      <p className="tool-hint">
        Opens the Windows snipping overlay (same as Win+Shift+S). Drag to pick an area; the snip is copied to the Windows clipboard so you can paste it into any app. Use a delay to open a menu first.
      </p>
      <p className="tool-hint">Windows Notes doesn't keep the image, and pasting pictures into notes is parked for now.</p>
    </div>
  );
}
