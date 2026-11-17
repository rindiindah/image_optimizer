/**
 * Every user-facing string in the app (English only, decision D8).
 * Keep copy here so it can be reviewed in one place and translated later.
 */
export const strings = {
  app: {
    name: "Precision Image Optimizer",
    tagline: "Choose the file size. Your images never leave your browser.",
  },
  workspace: {
    emptyHeading: "No images yet",
    emptyBody:
      "This app will let you set the exact output file size you need, then crop, resize, convert and download your images.",
    notYetAvailable: "Uploading isn't available yet. This part of the app is still being built.",
    privacy: "All processing happens in your browser. Your images are never uploaded.",
  },
  footer: {
    licence: "Free software, licensed under the GNU General Public License v3.0.",
  },
  errors: {
    unexpected: {
      heading: "Something went wrong",
      what: "The app hit an unexpected error and couldn't show this view.",
      originalSafe: "Your original images are safe. They're never changed or uploaded.",
      next: "Reload the page to continue.",
      reloadAction: "Reload page",
    },
  },
} as const;
