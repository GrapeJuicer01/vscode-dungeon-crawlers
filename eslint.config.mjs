// ESLint flat config for Pixel Agents.
// Rules come from docs/engineering/coding-standards.md sections 3 (bundle boundaries) and 10.
import { builtinModules } from 'node:module';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** Bare Node built-in names (`fs`, `path`, ...) plus the `node:` scheme. */
const NODE_BUILTINS = builtinModules.filter((name) => !name.startsWith('_'));
const NODE_BUILTIN_PATHS = NODE_BUILTINS.map((name) => ({
  name,
  message: 'Node built-ins are host-only. See coding-standards.md section 3.',
}));
const NODE_SCHEME_PATTERN = {
  group: ['node:*'],
  message: 'Node built-ins are host-only. See coding-standards.md section 3.',
};
const VSCODE_PATH = {
  name: 'vscode',
  message: 'The vscode API is host-only. See coding-standards.md section 3.',
};

/** Node globals for plain JavaScript tooling files (the TS files get them from @types/node). */
const NODE_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
};

export default defineConfig(
  {
    ignores: ['dist/', 'out/', 'node_modules/', '.vscode-test/'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // Listed explicitly (not projectService): projectService would resolve every file
        // to the root host tsconfig.json. See ADR 0004.
        project: ['./tsconfig.json', './tsconfig.webview.json', './tsconfig.tools.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Interface-shaped signatures (for example resolveWebviewView) keep unused parameters
      // with a leading underscore, matching tsc's noUnusedParameters convention.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: NODE_GLOBALS,
    },
  },
  {
    rules: {
      eqeqeq: 'error',
      'no-console': 'error',
    },
  },
  // Webview runtime may report a crash with console.error (the crash handler only).
  {
    files: ['src/webview/**/*.ts'],
    ignores: ['src/webview/index.html.ts'],
    rules: {
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  // Tooling, tests, and build scripts may print freely.
  {
    files: ['test/**', 'scripts/**', '*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },

  // ---- Bundle boundaries (coding-standards.md section 3, ADR 0004) ----

  // src/shared/**: imported by both bundles, so it imports nothing outside src/shared/.
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [VSCODE_PATH, ...NODE_BUILTIN_PATHS],
          patterns: [
            NODE_SCHEME_PATTERN,
            {
              group: [
                '**/monitor',
                '**/monitor/**',
                '**/game',
                '**/game/**',
                '**/webview',
                '**/webview/**',
                '**/extension',
                '**/host',
                '**/host/**',
              ],
              message: 'src/shared/ imports nothing outside src/shared/ (not even src/host/).',
            },
          ],
        },
      ],
    },
  },
  // src/host/**: vscode-free host logic (M2). Imports only src/shared/; vscode objects arrive as
  // narrow interfaces from extension.ts. Assumption: Node built-ins are banned too, so it stays
  // pure and testable; Node APIs belong in src/monitor/ or extension.ts.
  {
    files: ['src/host/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [VSCODE_PATH, ...NODE_BUILTIN_PATHS],
          patterns: [
            NODE_SCHEME_PATTERN,
            {
              group: [
                '**/monitor',
                '**/monitor/**',
                '**/game',
                '**/game/**',
                '**/webview',
                '**/webview/**',
                '**/extension',
              ],
              message: 'src/host/ is vscode-free host logic and imports only src/shared/.',
            },
          ],
        },
      ],
    },
  },
  // Host code: never the game or webview runtime. index.html.ts is the host-side exception.
  {
    files: ['src/extension.ts', 'src/monitor/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/game', '**/game/**', '**/webview/**', '!**/webview/index.html'],
              message:
                'Host code must not import game or webview runtime code (only src/webview/index.html.ts).',
            },
          ],
        },
      ],
    },
  },
  // Webview runtime and game: browser bundle, no vscode, no Node, no host code.
  {
    files: ['src/webview/**/*.ts', 'src/game/**/*.ts'],
    ignores: ['src/webview/index.html.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [VSCODE_PATH, ...NODE_BUILTIN_PATHS],
          patterns: [
            NODE_SCHEME_PATTERN,
            {
              group: [
                '**/monitor',
                '**/monitor/**',
                '**/extension',
                '**/index.html',
                '**/host',
                '**/host/**',
              ],
              message:
                'Webview code must not import host code (extension.ts, monitor/, host/, index.html.ts).',
            },
          ],
        },
      ],
    },
  },
  // src/webview/index.html.ts: host-side pure string builder that imports nothing at all.
  {
    files: ['src/webview/index.html.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '.*',
              message: 'src/webview/index.html.ts is a pure builder and imports nothing.',
            },
          ],
        },
      ],
    },
  },
);
