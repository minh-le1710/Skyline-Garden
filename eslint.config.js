import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** Logic game và giao thức chạy cả ở trình duyệt lẫn server: phải thuần và tất định. */
const PURE = ['src/game/**/*.ts', 'src/protocol/**/*.ts'];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-native',
      'node_modules',
      'playwright-report',
      'test-results',
      'server/dist',
      'android',
      'ios',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**', 'build/**', 'server/**', 'tests/**', 'e2e/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: PURE,
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'three',
            'three/*',
            'preact',
            'preact/*',
            '@preact/*',
            'node:*',
            '../render/*',
            '../ui/*',
            '../core/*',
            '../input/*',
            '../audio/*',
            '../net/*',
            '../social/*',
            '../platform/*',
            '../i18n',
            '../i18n/*',
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'fetch', 'performance'].map(
          (name) => ({
            name,
            message: 'Logic game phải chạy được trên server: không dùng API của trình duyệt.',
          }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Dùng Rng với luồng trong state.rng.' },
        { object: 'Date', property: 'now', message: 'Nhận `now` qua tham số.' },
        // Kết quả các hàm này có thể lệch bit cuối giữa V8 (server) và JavaScriptCore (iOS), làm hỏng replay.
        ...[
          'pow',
          'exp',
          'log',
          'log2',
          'log10',
          'sin',
          'cos',
          'tan',
          'atan',
          'atan2',
          'sqrt',
          'cbrt',
          'hypot',
        ].map((property) => ({
          object: 'Math',
          property,
          message: 'Dùng bảng số literal hoặc phép tính số nguyên.',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'Nhận `now` qua tham số.' },
        { selector: 'BinaryExpression[operator="**"]', message: 'Dùng bảng số literal hoặc phép nhân.' },
      ],
    },
  },
);
