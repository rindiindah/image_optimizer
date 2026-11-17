import { AppHeader } from "../components/layout/AppHeader";
import { EmptyWorkspace } from "../components/layout/EmptyWorkspace";
import { strings } from "../content/strings";

export function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6 sm:py-16">
        <EmptyWorkspace />
      </main>
      <footer className="border-t border-border px-4 py-4 text-center text-xs text-text-muted sm:px-6">
        {strings.footer.licence}
      </footer>
    </div>
  );
}
