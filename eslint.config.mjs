import metac from '@kingboss666/eslint-config'

export default metac({
  rules: {
    'no-case-declarations': 'off',
    'no-fallthrough': 'off',
    'no-console': 'off',
    'node/prefer-global/process': 'off',
    'ts/ban-ts-comment': 'off',
    '@typescript-eslint/prefer-literal-enum-member': 'off',
    'no-empty-pattern': 'off',
  },
  ignores: ['.vscode/**', '.cursor/**', '.agents/**', '.next/**', 'next-env.d.ts', '**/*.md'],
  tailwindcss: {},
})
