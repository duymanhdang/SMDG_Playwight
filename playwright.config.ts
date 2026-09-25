import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testMatch: ['**/tests/**/*.spec.ts', '**/suites/**/*.spec.ts'],

  // Timeouts (in ms)
  timeout: 120000, // 2 minutes per test
  expect: {
    timeout: 5000, // 5 seconds for expect assertions
  },

  // Retry settings — config-modifying specs reset shared admin config in
  // finally/defensive setup, so retries are safe to enable for flaky runs.
  retries: process.env.NODE_ENV === 'development' ? 0 : 1,

  // Workers - parallel in CI, sequential locally
  workers: process.env.CI ? 2 : 1,

  // Reporter
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],...(process.env.HUB_RUN_ID ? [['./dashboard/hub-reporter.js']] : []),

  use: {
    baseURL: process.env.BASE_URL,
    actionTimeout: 10000, // 10 seconds per action
    navigationTimeout: 60000, // 60 seconds for navigation (admin login can be slow)
    headless: process.env.CI ? true : false,
    viewport: process.env.CI ? { width: 1920, height: 1080 } : null,
    launchOptions: process.env.CI
      ? {}
      : {
          args: ['--start-maximized'],
        },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { channel: 'chromium' },
    },
  ],
});
