import { strings } from "../../content/strings";
import { UploadArea } from "../../features/upload/UploadArea";

/** Empty state: what the app does, and the (working) way to add images. */
export function EmptyWorkspace() {
  return (
    <section
      aria-labelledby="empty-workspace-heading"
      className="mx-auto w-full max-w-2xl text-center"
    >
      <h1 id="empty-workspace-heading" className="text-2xl font-semibold tracking-tight">
        {strings.workspace.emptyHeading}
      </h1>
      <p className="mt-3 text-text-muted">{strings.workspace.emptyBody}</p>
      <div className="mt-6">
        <UploadArea />
      </div>
      <p className="mt-2 text-sm text-text-muted">{strings.workspace.privacy}</p>
    </section>
  );
}
