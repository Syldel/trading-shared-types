// @ts-check
import eslint from '@eslint/js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // Après les règles de typescript-eslint : il désactive celles qui se
  // disputeraient avec Prettier, puis active `prettier/prettier`.
  prettierRecommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'off', // options[].value: any est volontaire (rule-builder)
    },
  },
  {
    ignores: ['dist/**'],
  },
);
