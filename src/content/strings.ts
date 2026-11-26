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
      "Cropping, rotating and resizing aren't available yet. This part of the app is still being built.",
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
  settings: {
    heading: "Output settings",
    modeLegend: "Size goal",
    modes: {
      maximum: {
        label: "Maximum",
        help: "The best quality that stays at or under the size you set. Use this for upload limits.",
      },
      range: {
        label: "Range",
        help: "The best quality between a minimum and a maximum size.",
      },
      target: {
        label: "Target",
        help: "As close as possible to the size you set. The file may end up slightly above or below it.",
      },
    },
    sizeLabel: { maximum: "Maximum size", range: "Maximum size", target: "Target size" },
    minLabel: "Minimum size",
    unitLabel: (field: string) => `Unit for ${field.toLowerCase()}`,
    sizeErrors: {
      empty: "Enter a size.",
      not_a_number: "Enter a number, for example 500.",
      not_positive: "Enter a size larger than 0.",
      too_small: "The smallest size you can set is 1 KB.",
      too_large: "The largest size you can set is 1,000 MB.",
      min_not_below_max: "The minimum must be smaller than the maximum.",
    },
    unitsNote: "1 KB = 1,000 bytes, 1 MB = 1,000,000 bytes.",
    formatLabel: "Output format",
    pngNote:
      "PNG is lossless: without colour reduction its size can only shrink a little. For small sizes, allow colour reduction or choose WebP or JPEG.",
    transparencyKept: "Transparency is kept.",
    transparencyLegend: "This image has transparency, which JPEG can't keep.",
    transparencyHelp:
      "Choose a colour to fill the transparent areas, or choose PNG or WebP to keep them.",
    backgrounds: { "#ffffff": "Fill with white", "#000000": "Fill with black" },
    colourNames: { "#ffffff": "white", "#000000": "black" } as Record<string, string>,
    moreOptions: "More options",
    minQualityLabel: "Minimum quality (1–100, optional)",
    minQualityHelp:
      "Leave empty for no minimum. A higher minimum keeps more detail but may not fit the size.",
    minQualityError: "Enter a whole number from 1 to 100, or leave it empty.",
    allowDimensions: "Allow smaller dimensions if the size can't be reached otherwise",
    allowColors: "Allow colour reduction",
    summaryHeading: "Summary",
    summary: {
      maximum: (limit: string) => `At most ${limit}`,
      range: (min: string, max: string) => `Between ${min} and ${max}`,
      target: (target: string) => `As close as possible to ${target}`,
      format: (format: string) => `Format: ${format}`,
      transparencyKept: "Transparency kept",
      transparencyFilled: (colour: string) => `Transparent areas filled with ${colour}`,
      dimensionsKept: "Dimensions unchanged",
      dimensionsMayShrink: "Dimensions may be reduced if needed",
      colorsMayReduce: "Colours may be reduced",
      minQuality: (q: number) => `Minimum quality ${String(q)}`,
    },
  },
  process: {
    optimize: "Optimize",
    cancel: "Cancel",
    fixFirst: "Complete the settings above to start.",
    otherRunning: "Another image is being optimized. Wait for it to finish, or cancel it.",
    starting: "Starting…",
    attempt: (attempt: number, max: number, phase: 1 | 2) =>
      phase === 2
        ? `Trying smaller dimensions: attempt ${String(attempt)} of up to ${String(max)}`
        : `Attempt ${String(attempt)} of up to ${String(max)}`,
    announce: {
      done: "Optimization finished.",
      error: "Optimization failed.",
      cancelled: "Optimization cancelled.",
    },
    errors: {
      unsupported_browser: {
        what: "This browser lacks a feature the app needs (OffscreenCanvas).",
        next: "Use a current version of Chrome, Edge, Firefox or Safari (16.4 or later).",
      },
      decode_failed: {
        what: "This image couldn't be read.",
        next: "Try another copy of the file, or a different browser.",
      },
      megapixel_limit: {
        what: "This image has more than 50 megapixels.",
        next: "Use a smaller copy of the image.",
      },
      blank_decode: {
        what: "This image came out empty when it was read, probably because it's too large for this device.",
        next: "Try a smaller copy of the image, or a different device.",
      },
      transparency_needs_decision: {
        what: "This image has transparency, which JPEG can't keep.",
        next: "Choose a fill colour, or choose PNG or WebP.",
      },
      invalid_settings: {
        what: "These settings can't be used.",
        next: "Check the sizes and the minimum quality, then try again.",
      },
      image_too_large: {
        what: "This image has too many pixels for PNG colour reduction (the limit is about 16.7 megapixels).",
        next: "Allow smaller dimensions, turn off colour reduction, or choose WebP.",
      },
      encode_failed: {
        what: "The image couldn't be compressed.",
        next: "Try again, or choose another format.",
      },
      worker_crashed: {
        what: "The browser stopped while compressing, possibly because it ran out of memory.",
        next: "Close other tabs and try again, or allow smaller dimensions.",
      },
    },
  },
  result: {
    heading: "Result",
    outdated: "Outdated: made with earlier settings. Optimize again to download.",
    previewAlt: "Optimized image",
    choose: "Choose a result",
    candidate: (size: string, difference: string, w: number, h: number) =>
      `${size} · ${difference} · ${String(w)} × ${String(h)} px`,
    atTarget: "exactly the target",
    difference: (percent: number, side: "above" | "below") =>
      percent === 0 ? `less than 1% ${side} the target` : `${String(percent)}% ${side} the target`,
    status: {
      maximumMet: (size: string, limit: string) => `Done: ${size}, within the ${limit} maximum.`,
      rangeMet: (size: string, min: string, max: string) =>
        `Done: ${size}, between ${min} and ${max}.`,
      targetMet: (size: string, difference: string) => `Target met: ${size} (${difference}).`,
      targetClose: (size: string, difference: string) =>
        `Close to the target: ${size} (${difference}).`,
      targetMissed: (size: string, percent: number, side: "above" | "below") =>
        `Target not reached. Closest result: ${size} (${String(percent)}% ${side} the target).`,
      maximumMissed: (limit: string) => `No file fits the ${limit} maximum with these settings.`,
      rangeBelow:
        "This image is smaller than the minimum even at the highest quality. Upscaling isn't used.",
      closest: (size: string) =>
        `The closest file tried was ${size}. It isn't offered as a download.`,
      failed: "No file could be made with these settings.",
    },
    next: {
      maximum:
        "You can raise the limit, lower or clear the minimum quality, allow smaller dimensions, or choose another format (for PNG: allow colour reduction).",
      rangeBelow:
        "You can lower the minimum, or choose a format or size that produces a larger file.",
      failed: "Try other settings or another format.",
    },
    originalSafe: "Your original file hasn't been changed.",
    labels: {
      original: "Original size",
      goal: { maximum: "Maximum", range: "Range", target: "Target" },
      output: "Output size",
      saving: "Change",
      dimensions: "Dimensions",
      format: "Format",
      quality: "Quality",
      attempts: "Encodes tried",
    },
    rangeGoal: (min: string, max: string) => `${min} – ${max}`,
    saving: (percent: number) =>
      percent >= 0 ? `${String(percent)}% smaller` : `${String(-percent)}% larger`,
    lossless: "Lossless",
    flagsHeading: "Notes",
    flags: {
      dimensions_reduced: "The dimensions were reduced to reach the size, as you allowed.",
      quality_floor_reached:
        "Your minimum quality was reached: a smaller file would need a lower quality.",
      format_fallback:
        "The app's own encoder couldn't run, so the browser's encoder was used. The format shown is the file's real format.",
      transparency_flattened: "Transparent areas were filled with the colour you chose.",
      colors_reduced: "The number of colours was reduced, as you allowed.",
      larger_than_source: "This file is larger than the original.",
      passthrough: "The original file was kept, because it already fits.",
      hdr_tone_mapped:
        "High dynamic range (10-bit) colours were converted to standard 8-bit; very bright areas may look less vivid.",
    },
    download: "Download",
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
