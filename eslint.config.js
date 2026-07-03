import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/typescript';

export default tseslint.config(
  { ignores: ['out/', 'node_modules/', 'bahamut/', 'hybrid/', 'inspircd/', 'ratbox/', 'unrealircd/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ...solid,
    rules: {
      ...solid.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      // IRC protocol code matches control bytes (\x02, \x03, \x1f, ...) by design.
      'no-control-regex': 'off',
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
);
