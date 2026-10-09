import typescriptParser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'

const correctnessRules = {
  'eqeqeq': 'error',
  'no-debugger': 'error',
  'no-dupe-else-if': 'error',
  'no-duplicate-case': 'error',
  'no-duplicate-imports': 'error',
  'no-loss-of-precision': 'error',
  'no-self-assign': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
}

export default [
  {
    ignores: ['dist/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: correctnessRules,
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 'latest',
        parser: typescriptParser,
        sourceType: 'module',
      },
    },
    rules: correctnessRules,
  },
]
