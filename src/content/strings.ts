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
      "Set the exact output file size you need, then crop, resize, convert and download your images, one at a time or as a ZIP.",
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
    selectLabel: (name: string) => `Show ${name}`,
    checkLabel: (name: string) => `Select ${name}`,
    cancelLabel: (name: string) => `Cancel ${name}`,
    retryLabel: (name: string) => `Retry ${name}`,
    retry: "Retry",
    job: {
      waiting: "Waiting",
      starting: "Optimizing: starting…",
      attempt: (attempt: number, max: number) =>
        `Optimizing: attempt ${String(attempt)} of up to ${String(max)}`,
      failed: (what: string) => `Failed: ${what}`,
      cancelled: "Cancelled",
      skipped: "Skipped: settings incomplete. Open this image to finish them.",
      outdated: "Outdated: optimize again",
      done: (size: string) => `Done: ${size}`,
      targetMet: (size: string) => `Target met: ${size}`,
      targetClose: (size: string) => `Close to the target: ${size}`,
      targetMissed: (size: string) => `Target not reached: ${size}`,
      noFile: "No file fits these settings",
    },
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
  batch: {
    selected: (n: number) => `${String(n)} selected`,
    selectAll: "Select all",
    clear: "Clear selection",
    optimize: "Optimize selected",
    cancelAll: "Cancel all",
    zip: "Download selected (ZIP)",
    zipNone: "Select images with an up-to-date result to download them as a ZIP.",
    leftOut: (left: number, total: number, reasons: string[]) =>
      `${String(left)} of ${String(total)} selected ${total === 1 ? "image isn't" : "images aren't"} included: ${reasons.join(", ")}.`,
    reasons: {
      noResult: (n: number) => `${String(n)} ${n === 1 ? "has" : "have"} no result yet`,
      outdated: (n: number) => `${String(n)} ${n === 1 ? "result is" : "results are"} outdated`,
      noFile: (n: number) => `${String(n)} ${n === 1 ? "has" : "have"} no file that fits`,
    },
    preparing: (done: number, total: number) =>
      `Preparing ZIP: ${String(done)} of ${String(total)} files`,
    zipReady: (n: number) => `ZIP with ${String(n)} ${n === 1 ? "file" : "files"} created.`,
    zipFailed:
      "The ZIP couldn't be created. Your images and results are safe; you can still download them one by one.",
  },
  apply: {
    open: "Apply to selected images…",
    heading: "Apply settings to selected images",
    intro: (name: string, n: number) =>
      `Copy settings from ${name} to ${String(n)} selected ${n === 1 ? "image" : "images"}.`,
    legend: "Settings to copy (these are overwritten)",
    groups: {
      size: "File size: the size goal and the size(s)",
      format: "Format, and the fill colour for transparent areas in JPEG",
      more: "More options: minimum quality, smaller dimensions, colour reduction, keep the original",
    },
    never:
      "Never copied: crop, rotation, Exact size, output width and height, and the minimum width and height, because they depend on each image's dimensions.",
    running: (n: number) =>
      `${String(n)} of them ${n === 1 ? "is" : "are"} being optimized and won't be changed.`,
    outdated: "Existing results of the changed images become outdated.",
    apply: "Apply",
    cancel: "Cancel",
    applied: (n: number) => `Settings applied to ${String(n)} ${n === 1 ? "image" : "images"}.`,
  },
  preview: {
    heading: "Preview",
    alt: (name: string) => `Original image: ${name}`,
    caption: "Original image. Shown at reduced size; the full image is kept for processing.",
    editedAlt: (name: string) => `Edited image: ${name}`,
    edited: (crop: string | null, rotation: number) =>
      `Edited: ${[crop ? `cropped to ${crop}` : "", rotation ? `rotated ${String(rotation)}°` : ""]
        .filter(Boolean)
        .join(", ")}. Shown at reduced size.`,
    showOriginal: "Show original",
    edit: "Crop and rotate",
    editBusy: "Cropping is available again when this image has finished processing.",
  },
  edit: {
    heading: "Crop and rotate",
    help: "Drag the corners or edges, or move the selection. Arrow keys move it; on a handle they resize (Shift: 10 px, Ctrl or Cmd: 100 px). For exact pixels, use the fields.",
    ratioLabel: "Shape",
    ratios: {
      free: "Free",
      original: "Original",
      "1:1": "Square (1:1)",
      "4:3": "4:3",
      "3:2": "3:2",
      "16:9": "16:9",
      exact: "Exact size",
    },
    portrait: "Portrait (3:4, 2:3, 9:16)",
    exactWidth: "Exact width (px)",
    exactHeight: "Exact height (px)",
    exactHelp:
      "The selection keeps this shape, and the result is exactly this size. It can't be larger than the selection: images are never enlarged.",
    exactTooLarge: (w: number, h: number) =>
      `The selection (${String(w)} × ${String(h)} px) is smaller than the exact size. Select a larger area or enter a smaller size.`,
    exactInvalid: "Enter a whole number of pixels (1 or more) for both sides.",
    rotateLeft: "Rotate left",
    rotateRight: "Rotate right",
    fieldsLegend: "Selection in image pixels",
    x: "Left (X)",
    y: "Top (Y)",
    width: "Width",
    height: "Height",
    fieldError: (w: number, h: number) =>
      `Use whole pixels inside the image (${String(w)} × ${String(h)} px), at least 1 × 1.`,
    selected: (w: number, h: number) => `Selected area: ${String(w)} × ${String(h)} px`,
    whole: (w: number, h: number) => `Whole image: ${String(w)} × ${String(h)} px (no crop)`,
    reset: "Reset",
    cancel: "Cancel",
    apply: "Apply crop",
    aria: {
      cropArea: "Crop selection. Use the arrow keys to move it.",
      nwDragHandle: "Top-left corner. Arrow keys resize.",
      nDragHandle: "Top edge. Arrow keys resize.",
      neDragHandle: "Top-right corner. Arrow keys resize.",
      eDragHandle: "Right edge. Arrow keys resize.",
      seDragHandle: "Bottom-right corner. Arrow keys resize.",
      sDragHandle: "Bottom edge. Arrow keys resize.",
      swDragHandle: "Bottom-left corner. Arrow keys resize.",
      wDragHandle: "Left edge. Arrow keys resize.",
    },
    imageLabel: "Image to crop",
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
    minSizeLegend: "Not smaller than (optional)",
    minSizeHelp: "Leave a field empty for no minimum on that side.",
    minWidth: "Minimum width (px)",
    minHeight: "Minimum height (px)",
    minSizeErrors: {
      invalid: "Enter whole pixels (1 or more), or leave the field empty.",
      too_large: "The minimum can't be larger than the output size.",
    },
    resizeLegend: "Output size",
    resizeWidth: "Width (px)",
    resizeHeight: "Height (px)",
    keepAspect: "Keep aspect ratio",
    resizeHelp: (w: number, h: number) =>
      `Leave empty to keep ${String(w)} × ${String(h)} px. Images are never enlarged.`,
    resizeErrors: {
      invalid: "Enter whole pixels (1 or more) for both sides, or turn on Keep aspect ratio.",
      too_large: (w: number, h: number) =>
        `The output can't be larger than ${String(w)} × ${String(h)} px (images are never enlarged).`,
    },
    resizeExact: (w: number, h: number) =>
      `${String(w)} × ${String(h)} px, set by Exact size in Crop and rotate.`,
    allowColors: "Allow colour reduction",
    keepOriginal: "Keep the original file when it already fits",
    keepOriginalHelp:
      "Only when the image isn't cropped, rotated or resized and keeps its format. The original keeps its photo details (such as camera, date and location). Turn this off to always make a new file without them.",
    summaryHeading: "Summary",
    summary: {
      maximum: (limit: string) => `At most ${limit}`,
      range: (min: string, max: string) => `Between ${min} and ${max}`,
      target: (target: string) => `As close as possible to ${target}`,
      format: (format: string) => `Format: ${format}`,
      transparencyKept: "Transparency kept",
      transparencyFilled: (colour: string) => `Transparent areas filled with ${colour}`,
      cropped: (w: number, h: number) => `Cropped to ${String(w)} × ${String(h)} px`,
      notCropped: "Not cropped",
      rotated: (deg: number) => `Rotated ${String(deg)}°`,
      output: (w: number, h: number) => `Output ${String(w)} × ${String(h)} px`,
      dimensionsKept: "Dimensions unchanged",
      dimensionsMayShrink: "Dimensions may be reduced further if needed",
      notBelow: (w: number, h: number) => `Not smaller than ${String(w)} × ${String(h)} px`,
      colorsMayReduce: "Colours may be reduced",
      minQuality: (q: number) => `Minimum quality ${String(q)}`,
    },
  },
  process: {
    optimize: "Optimize",
    cancel: "Cancel",
    fixFirst: "Complete the settings above to start.",
    waiting: "Waiting for another image to finish.",
    starting: "Starting…",
    attempt: (attempt: number, max: number, phase: 1 | 2) =>
      phase === 2
        ? `Trying smaller dimensions: attempt ${String(attempt)} of up to ${String(max)}`
        : `Attempt ${String(attempt)} of up to ${String(max)}`,
    announce: {
      done: "Optimization finished.",
      error: "Optimization failed.",
      cancelled: "Optimization cancelled.",
      batchStart: (queued: number, skipped: number, upToDate: number) =>
        [
          `Optimizing ${String(queued)} ${queued === 1 ? "image" : "images"}.`,
          skipped > 0 ? `${String(skipped)} skipped: settings incomplete.` : "",
          upToDate > 0 ? `${String(upToDate)} already up to date.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      batchDone: (done: number, failed: number, cancelled: number) =>
        `Batch finished: ${String(done)} done, ${String(failed)} failed, ${String(cancelled)} cancelled.`,
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
      originalDimensions: "Original dimensions",
      dimensions: "Dimensions",
      originalFormat: "Original format",
      format: "Format",
      quality: "Quality",
      attempts: "Encodes tried",
    },
    rangeGoal: (min: string, max: string) => `${min} – ${max}`,
    saving: (percent: number, size: string) =>
      percent >= 0
        ? `${String(percent)}% smaller (${size} saved)`
        : `${String(-percent)}% larger (${size} more)`,
    lossless: "Lossless",
    notReencoded: "Original (not re-encoded)",
    metadata: {
      removed:
        "Photo details (such as camera, date and location) aren't included in the optimized file.",
      kept: 'This is your original file, unchanged. Its photo details (such as camera, date and location, if present) are kept. To remove them, turn off "Keep the original file when it already fits" in More options and optimize again.',
    },
    compare: {
      heading: "Compare",
      viewLegend: "View",
      slider: "Slider",
      sideBySide: "Side by side",
      zoomLegend: "Zoom",
      fit: "Fit",
      full: "100 %",
      original: "Original",
      originalEdited: "Original (cropped and rotated)",
      optimized: "Optimized",
      divider: "Divider position",
      dividerValue: (percent: number) =>
        `${String(percent)}% original, ${String(100 - percent)}% optimized`,
      panHint: "At 100 %, drag, scroll or use the arrow keys to move around.",
      preparing: "Preparing the full-size original…",
      failed: (what: string) => `The full-size original couldn't be shown: ${what} Showing Fit.`,
      outdated:
        "The comparison isn't available while the result is outdated, because the original would no longer match the settings on screen. Optimize again to compare.",
      originalAlt: "Original image, for comparison",
    },
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
