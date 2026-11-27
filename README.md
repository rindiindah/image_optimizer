# Precision Image Optimizer

A browser-only image optimizer where **you choose the output file size**. Upload images,
crop, resize, convert, compare and download them. Every step runs in your browser:
**your images are never uploaded**.

> **Status:** early development. You can add images (including HEIC), crop, rotate and
> resize them, set a maximum, range or target file size, optimize them to JPEG, PNG or WebP
> (one by one or several at once, copying settings to the selected images), compare each
> result with the original (slider or side by side, up to 100 %), and download the results
> one by one or as a ZIP. Accessibility and mobile polish, Help and Privacy are still to come.

## Requirements

- Node.js 22.22.2 or newer (see `.nvmrc`)
- npm (the lockfile is committed; use `npm ci` for a clean install)

## Getting started

```sh
npm ci
npx playwright install chromium firefox webkit   # only needed for browser tests
npm run dev
```

## Commands

| Command                | What it does                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run dev`          | Start the development server                                      |
| `npm run build`        | Type-check and build the production site into `dist/`             |
| `npm run preview`      | Serve `dist/` on port 4173 with the production security headers   |
| `npm run typecheck`    | Type-check the whole project                                      |
| `npm test`             | Run the unit tests (Vitest)                                       |
| `npm run test:watch`   | Run the unit tests in watch mode                                  |
| `npm run e2e`          | Build, then run the browser tests in Chromium, Firefox and WebKit |
| `npm run lint`         | Lint with ESLint                                                  |
| `npm run format`       | Format with Prettier                                              |
| `npm run format:check` | Check formatting without changing files                           |

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, format check,
typecheck, unit tests and the browser tests (Chromium, Firefox, WebKit) on every push and pull request.

## Privacy

Images are processed locally in your browser. The site's Content-Security-Policy
(`vercel.json`) only allows network connections back to the site itself, so image
data has nowhere else to go. No analytics are used.

## Licence

Copyright (C) 2026 the Precision Image Optimizer contributors.

This program is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License, version 3 only (`GPL-3.0-only`). See
[`LICENSE`](LICENSE) for the full text and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
for the licences of included third-party software.
