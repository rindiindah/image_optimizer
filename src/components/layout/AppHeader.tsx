import { strings } from "../../content/strings";

export function AppHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-0.5 px-4 py-3 sm:px-6">
        <p className="text-lg font-semibold tracking-tight">{strings.app.name}</p>
        <p className="text-sm text-text-muted">{strings.app.tagline}</p>
      </div>
    </header>
  );
}
