import { Component, type ReactNode } from "react";
import { strings } from "../content/strings";
import { reportError } from "./report-error";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Last-resort boundary for render errors. Shows the standard message pattern
 * (what happened · is the original safe · what next).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    reportError(error);
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    const copy = strings.errors.unexpected;
    return (
      <div role="alert" className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.heading}</h1>
        <p className="mt-3">{copy.what}</p>
        <p className="mt-2">{copy.originalSafe}</p>
        <p className="mt-2 text-text-muted">{copy.next}</p>
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
          className="mt-6 rounded-control bg-accent px-4 py-2 font-medium text-accent-contrast"
        >
          {copy.reloadAction}
        </button>
      </div>
    );
  }
}
