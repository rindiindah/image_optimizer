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
    notYetAvailable:
      "Setting the output size and compressing aren't available yet. This part of the app is still being built.",
    privacy: "All processing happens in your browser. Your images are never uploaded.",
  },
  upload: {
    heading: "Add images",
    chooseButton: "Choose images",
    hint: "or drag and drop them here, or paste with Ctrl+V (Cmd+V on a Mac).",
    dropActive: "Drop the images to add them",
    supported:
      "JPEG, PNG, WebP, GIF, BMP, AVIF or HEIC. Up to 100 MB and 50 megapixels each, and up to 50 images.",
  },
  queue: {
    heading: "Images",
    count: (n: number) => `${String(n)} of 50`,
    untitled: "Untitled image",
    status: { reading: "Reading…", ready: "Ready", error: "Can't be used" },
    removeLabel: (name: string) => `Remove ${name}`,
    remove: "Remove",
    selectLabel: (name: string) => `Select ${name}`,
    dimensions: (w: number, h: number) => `${String(w)} × ${String(h)} px`,
    transparent: "Has transparency",
    announcement: (added: number, failed: number, notAdded: number) =>
      [
        added > 0 ? `${String(added)} ${added === 1 ? "image" : "images"} added.` : "",
        failed > 0 ? `${String(failed)} couldn't be used.` : "",
        notAdded > 0
          ? `${String(notAdded)} ${notAdded === 1 ? "file wasn't" : "files weren't"} added: the limit is 50 images.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
  },
  preview: {
    heading: "Preview",
    alt: (name: string) => `Original image: ${name}`,
    caption: "Original image. Shown at reduced size; the full image is kept for processing.",
  },
  formats: {
    jpeg: "JPEG",
    png: "PNG",
    webp: "WebP",
    gif: "GIF",
    bmp: "BMP",
    avif: "AVIF",
    heic: "HEIC",
    heif: "HEIF",
  },
  notices: {
    first_frame_only: "Animated image: only the first frame is used.",
    hdr_converted:
      "High dynamic range (10-bit) image: colours are converted to standard 8-bit, so very bright areas may look less vivid.",
    extension_mismatch: (type: string, extension: string) =>
      `This file is a ${type}, although its name ends in .${extension}.`,
  },
  imageErrors: {
    originalSafe: "Your original file hasn't been changed.",
    empty_file: { what: "This file is empty.", next: "Check the file and add it again." },
    file_too_large: {
      what: "This file is larger than 100 MB, the most this app accepts.",
      next: "Use a smaller copy of the image.",
    },
    unsupported_format: {
      what: "This file isn't an image type this app can read.",
      next: "Use a JPEG, PNG, WebP, GIF, BMP, AVIF or HEIC image.",
    },
    svg_not_supported: {
      what: "SVG files aren't supported.",
      next: "Export the image as PNG or JPEG first, then add it.",
    },
    decode_failed: {
      what: "This image couldn't be read. It may be damaged, or this browser can't open its format.",
      next: "Try another copy of the file, or a different browser.",
    },
    megapixel_limit: {
      what: "This image has more than 50 megapixels, too many to process reliably in a browser.",
      next: "Use a smaller copy of the image.",
    },
    blank_decode: {
      what: "This image came out empty when it was read. Usually this means it's too large for this device; it can also mean the image is completely transparent.",
      next: "Try a smaller copy of the image, or a different device.",
    },
    unsupported_browser: {
      what: "This browser lacks a feature the app needs to read images (OffscreenCanvas).",
      next: "Use a current version of Chrome, Edge, Firefox or Safari (16.4 or later).",
    },
    worker_crashed: {
      what: "The browser stopped while reading this image, possibly because it ran out of memory.",
      next: "Close other tabs and try again, or use a smaller copy of the image.",
    },
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
