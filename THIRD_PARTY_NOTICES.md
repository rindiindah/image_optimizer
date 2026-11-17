# Third-Party Notices

Precision Image Optimizer is free software licensed under the GNU General Public
License, version 3 only (`GPL-3.0-only`). See [`LICENSE`](LICENSE).

This file lists third-party software included in the code that is delivered to your
browser, along with the licence notices those projects require. It is updated whenever
a dependency that ships to the browser is added, upgraded or removed.

## Software shipped to the browser

| Component                                                                                           | Version | Licence | Copyright                                          |
| --------------------------------------------------------------------------------------------------- | ------- | ------- | -------------------------------------------------- |
| [React](https://github.com/facebook/react) (`react`)                                                | 19.3.1  | MIT     | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [React DOM](https://github.com/facebook/react) (`react-dom`)                                        | 19.3.1  | MIT     | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [Scheduler](https://github.com/facebook/react) (`scheduler`, used by React DOM)                     | 0.28.0  | MIT     | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) (generated stylesheet, incl. Preflight) | 4.3.5   | MIT     | Copyright (c) Tailwind Labs, Inc.                  |

### MIT License

The MIT licence text below applies to each component listed above as MIT, with that
component's copyright line shown in the table.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Coming in later milestones

Image encoders and decoders (MozJPEG, libwebp, OxiPNG, libimagequant / pngquant and the
HEIC decoder libheif / libde265) are added in milestones M1 and M2. Their notices,
including the attribution that pngquant's licence requires and the LGPL notice for
libheif, will be added here when they are installed.

## Development tools (not shipped to the browser)

These are used only to build and test the project and are not part of the delivered app:
Vite, @vitejs/plugin-react, @tailwindcss/vite, TypeScript, ESLint, @eslint/js,
typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh,
eslint-config-prettier, globals, Prettier, Vitest, jsdom, Testing Library
(`@testing-library/react`, `@testing-library/dom`), Playwright, and the
`@types/*` packages. Each is distributed under its own licence (MIT or Apache-2.0);
see the respective package in `node_modules`.
