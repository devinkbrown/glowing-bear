import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/typescript';

export default tseslint.config(
  { ignores: ['out/', 'desktop-out/', 'src-tauri/target/', 'current/', '.releases/', 'node_modules/', 'test-results/', '.playwright-tmp/', 'bahamut/', 'hybrid/', 'inspircd/', 'ratbox/', 'unrealircd/', 'public/', '.claude/', '**/.claude/worktrees/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ...solid,
    languageOptions: {
      ...solid.languageOptions,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...solid.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // IRC protocol code matches control bytes (\x02, \x03, \x1f, ...) by design.
      'no-control-regex': 'off',
    },
  },
  {
    // Browser/Emscripten globals have no complete upstream declaration. Keep
    // unsafety isolated to these adapter files; application code stays strict.
    files: [
      'src/lib/suimyaku-media/OpcodecWasm.ts',
      'src/lib/suimyaku-media/videoEncodeWorker.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Static SVG art scenes: constant arrays rendered once — .map and unused
    // loop indices are fine here; <For> buys nothing without reactivity.
    files: ['src/ui/bits/ThemeBg.tsx', 'src/ui/bits/AstronautBear.tsx', 'src/ui/bits/StarfieldBg.tsx'],
    rules: {
      'solid/prefer-for': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
);
