import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/theme";
import { MeasureOverlay } from "./measure/MeasureOverlay";
import "./styles.css";

// The screen measure overlay is a second window running this same page.
const isMeasureOverlay = "__TAURI_INTERNALS__" in window && getCurrentWindow().label === "measure";
if (isMeasureOverlay) document.documentElement.classList.add("measure-overlay");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isMeasureOverlay ? <MeasureOverlay /> : <App />}</React.StrictMode>,
);
