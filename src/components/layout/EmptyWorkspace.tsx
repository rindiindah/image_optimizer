import { strings } from "../../content/strings";

/**
 * Empty state for the workspace. Deliberately has no controls: uploading
 * arrives in M2, and the app must not show controls that don't work yet.
 */
export function EmptyWorkspace() {
  return (
    <section
      aria-labelledby="empty-workspace-heading"
      className="mx-auto w-full max-w-2xl rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center"
    >
      <h1 id="empty-workspace-heading" className="text-2xl font-semibold tracking-tight">
        {strings.workspace.emptyHeading}
      </h1>
      <p className="mt-3 text-text-muted">{strings.workspace.emptyBody}</p>
      <p className="mt-6 text-sm font-medium">{strings.workspace.notYetAvailable}</p>
      <p className="mt-2 text-sm text-text-muted">{strings.workspace.privacy}</p>
    </section>
  );
}
