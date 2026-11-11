import playwright from 'eslint-plugin-playwright';
import parser from '@typescript-eslint/parser';

export default [{
  files: ['e2e/**/*.ts'],
  languageOptions: { parser },
  plugins: { playwright },
  rules: {
    'playwright/no-wait-for-timeout': 'error',
    'playwright/no-force-option': 'error',
    'playwright/no-element-handle': 'error',
    'playwright/no-page-pause': 'error',
  },
}];
