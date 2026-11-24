import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true, minimumDescriptionLength: 10 }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'react/no-danger': 'error',
      'no-restricted-imports': ['error', { paths: [{ name: 'dotenv', message: 'Use scripts/lib/env.ts' }] }]
    }
  },
  // Frozen literals: never auto-fix or reformat (K29)
  { files: ['src/lib/weapon/data.ts'], rules: { quotes: 'off', 'no-irregular-whitespace': 'off', 'no-multi-spaces': 'off', 'no-trailing-spaces': 'off' } },
  // Step 1 only; this block and the folder are deleted in Step 3
  { files: ['src/components/legacy/**'], rules: { '@typescript-eslint/no-explicit-any': 'off', '@next/next/no-html-link-for-pages': 'off', 'react/no-children-prop': 'off', 'react-hooks/set-state-in-effect': 'off', '@typescript-eslint/no-unused-vars': 'off' } },
  globalIgnores(['.next/**', 'build/**', 'next-env.d.ts', 'drizzle/**', 'docs/**', 'backups/**', 'assets-archive/**', '.secrets/**'])
])
