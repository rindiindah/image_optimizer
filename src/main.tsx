import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { reportError } from "./app/report-error";
import "./app/styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}

createRoot(container, {
  // Errors caught by ErrorBoundary are already reported in componentDidCatch.
  onCaughtError: () => undefined,
  onUncaughtError: reportError,
  onRecoverableError: reportError,
}).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
