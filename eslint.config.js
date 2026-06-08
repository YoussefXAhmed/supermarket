/**
 * Phase 1 — Design System lint rules.
 *
 * Single concern: block numeric/px/rem/em literals inside JSX `style={{}}`
 * objects, except for properties where unitless numbers are conventional
 * (fontWeight, opacity, zIndex, flex, etc.).
 *
 * Why warn-level (not error): the Phase 1 audit found 264 existing
 * violations across 48 files. Surfacing them as warnings drives the
 * later-phase migrations without breaking dev/build today. Bump to
 * `error` once Phases 7/8 land and the violations are at zero.
 *
 * Not in scope here:
 *   • Linting actual .css files (deferred to Phase 2 — Stylelint).
 *   • Other react/jsx-a11y/import rules (intentionally minimal).
 */

import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Properties where unitless numeric literals are legitimate and should
// NOT trigger the rule (since they're inherently unitless).
const UNITLESS_OK = [
  'flex',
  'flexGrow',
  'flexShrink',
  'flexOrder',
  'order',
  'opacity',
  'zIndex',
  'fontWeight',
  'lineHeight',
  'tabSize',
  'columnCount',
  'gridRow',
  'gridColumn',
  'gridRowStart',
  'gridRowEnd',
  'gridColumnStart',
  'gridColumnEnd',
];

const unitlessOkPattern = `^(${UNITLESS_OK.join('|')})$`;

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Promise: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        Number: 'readonly',
        Boolean: 'readonly',
        Array: 'readonly',
        Object: 'readonly',
        String: 'readonly',
        Symbol: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        Error: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        process: 'readonly',
      },
    },
    settings: { react: { version: '18' } },
    rules: {
      // ── Design System Phase 1 ─────────────────────────────────────
      // Catch numeric literals in JSX style props.
      //
      // Selector breakdown:
      //   JSXAttribute[name.name='style']  — the style={{...}} prop
      //   ObjectExpression                  — the {{ }} literal
      //   Property                          — one entry
      //   :not([key.name=/<unitless>/])     — skip whitelisted properties
      //   Literal[value=...]                — numeric or px/rem/em value
      'no-restricted-syntax': [
        'warn',
        {
          // Numeric Literal values match against `raw` (always a string),
          // not `value` (a Number for numerics). Without this distinction
          // the regex never fires on `style={{ gap: 4 }}`.
          selector: `JSXAttribute[name.name='style'] ObjectExpression > Property:not([key.name=/${unitlessOkPattern}/]) > Literal[raw=/^-?[0-9]+(\\.[0-9]+)?$/]`,
          message:
            'Phase 1: numeric literal in inline style prop. Use a design token from globals.css (e.g. var(--space-3)) or move to a CSS class. Whitelist: fontWeight, opacity, zIndex, flex, lineHeight, etc.',
        },
        {
          // String literals with px/rem/em units. Match on raw too —
          // raw includes the quotes so we match against the inside via
          // value (which IS a string for string-literals).
          selector: `JSXAttribute[name.name='style'] ObjectExpression > Property > Literal[value=/^-?[0-9]+(\\.[0-9]+)?(px|rem|em)$/]`,
          message:
            'Phase 1: hardcoded px/rem/em literal in inline style prop. Use a design token from globals.css (e.g. var(--space-4), var(--font-sm)) or move to a CSS class.',
        },
        {
          // Composite string values ONLY ('0 0 8px', '4px 0', '10px 16px').
          // Regex requires at least one space inside the literal, which
          // prevents double-flagging single values like '8px' (already
          // caught by the previous selector).
          selector: `JSXAttribute[name.name='style'] ObjectExpression > Property > Literal[value=/ .*[0-9]+(px|rem|em)/]`,
          message:
            'Phase 1: composite style string with hardcoded px/rem/em. Use design tokens (e.g. "0 0 var(--space-2)") or move to a CSS class.',
        },
      ],
    },
  },

  // Ignore generated / vendor / test fixtures.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'erp-custom/**',
      'public/**',
      'deploy/**',
      '*.config.js',
      'eslint.config.js',
    ],
  },
];
