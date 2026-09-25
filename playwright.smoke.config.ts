import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  // Scope smoke discovery to the main tests folder only.
  testDir: './tests/smoke',
  testMatch: '**/*.spec.ts',
});
