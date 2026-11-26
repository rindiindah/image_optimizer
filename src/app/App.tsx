import { AppHeader } from "../components/layout/AppHeader";
import { EmptyWorkspace } from "../components/layout/EmptyWorkspace";
import { strings } from "../content/strings";
import { ImagePreview } from "../features/preview/ImagePreview";
import { ImageQueue } from "../features/queue/ImageQueue";
import { useQueue } from "../features/queue/store";
import { ResultPanel } from "../features/results/ResultPanel";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { UploadArea } from "../features/upload/UploadArea";

export function App() {
  const hasImages = useQueue((state) => state.items.length > 0);
  const announcement = useQueue((state) => state.announcement);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="flex-1 px-4 py-10 sm:px-6 sm:py-16">
        {hasImages ? (
          <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <UploadArea compact />
              <ImageQueue />
            </div>
            <div className="flex flex-col gap-4">
              <ImagePreview />
              <SettingsPanel />
              <ResultPanel />
              <p className="text-sm font-medium">{strings.workspace.notYetAvailable}</p>
              <p className="text-sm text-text-muted">{strings.workspace.privacy}</p>
            </div>
          </div>
        ) : (
          <EmptyWorkspace />
        )}
        {/* Announces "3 images added. 1 couldn't be used." to screen readers. */}
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </main>
      <footer className="border-t border-border px-4 py-4 text-center text-xs text-text-muted sm:px-6">
        {strings.footer.licence}
      </footer>
    </div>
  );
}
