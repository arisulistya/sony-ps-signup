import { test as base, expect, chromium, type Browser } from '@playwright/test';
import { SignupPage } from '../pages/signup.page';
import { BatchPacer } from '../helpers/batch-pacing';

type BatchState = { browser: Browser; pacer: BatchPacer };

export const test = base.extend<{ signup: SignupPage }>({
  signup: async ({ page }, use) => {
    await use(new SignupPage(page));
  },
});

export const liveTest = base.extend<{ signup: SignupPage }, { batchState: BatchState | null }>({
  batchState: [async ({}, use) => {
    if (!process.env.SIGNUP_BATCH_INPUT) {
      await use(null);
      return;
    }
    const browser = await chromium.connectOverCDP('chrome', { timeout: 120_000 });
    const state: BatchState = { browser, pacer: new BatchPacer() };
    try {
      await use(state);
    } finally {
      if (state.browser.isConnected()) await state.browser.close();
    }
  }, { scope: 'worker', timeout: 180_000 }],
  signup: [async ({ batchState }, use, testInfo) => {
    if (batchState) {
      await batchState.pacer.waitForNext();
    }
    const browser = batchState?.browser ?? await chromium.connectOverCDP('chrome', { timeout: 120_000 });
    try {
      const context = browser.contexts()[0];
      if (!context) throw new Error('Chrome has no accessible browser context');
      const livePage = process.env.RESUME_SIGNUP === '1'
        ? context.pages().filter((p) => p.url().includes('/personal_info')).at(-1)
        : await context.newPage();
      if (!livePage) throw new Error('No PlayStation personal information page is open in Chrome');
      await use(new SignupPage(livePage));
      if (batchState && testInfo.status === 'passed') {
        await batchState.pacer.complete(livePage);
      }
    } finally {
      if (!batchState) await browser.close();
    }
  }, { timeout: 300_000 }],
});

export { expect };
