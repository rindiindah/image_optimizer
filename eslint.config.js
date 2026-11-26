import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "dist",
    "dist-harness",
    "coverage",
    "test-results",
    "playwright-report",
    "blob-report",
    "docs",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/unit/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["src/workers/**/*.ts", "tests/harness/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  {
    files: ["*.config.{js,ts}", "vite.shared.ts", "tests/e2e/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["tests/e2e/**/*.ts"],
    ignores: ["tests/e2e/fixtures.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^all(TextContents|InnerTexts)$/]",
          message:
            "Crashes Playwright's Firefox on role-scoped locators (2026-11-26, docs/Plan.md); use evaluateAll((els) => els.map((e) => e.textContent)).",
        },
        {
          selector:
            "ImportDeclaration[source.value='@playwright/test'] ImportSpecifier[imported.name=/^(test|expect)$/]",
          message: "Import test/expect from ./fixtures (it adds the page-crash guard).",
        },
      ],
    },
  },
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  prettier,
]);
