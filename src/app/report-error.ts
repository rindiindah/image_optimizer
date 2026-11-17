/**
 * Logging policy: the app sends nothing anywhere (no analytics, no error service).
 * In production the console gets only the error's type name, never its message
 * or stack, because those could later contain filenames or image details.
 * In development the full error is logged to help debugging.
 */
export function reportError(error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(error);
    return;
  }
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`Unexpected error (${name}).`);
}
