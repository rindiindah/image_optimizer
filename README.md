# Precision Image Optimizer

A browser-only image optimizer where **you choose the output file size**. Upload images,
crop, resize, convert, compare and download them. Every step runs in your browser:
**your images are never uploaded**.

> **Status:** early development. The project foundation is in place; uploading and
> optimizing images are being built and aren't available yet.

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
