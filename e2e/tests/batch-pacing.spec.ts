import { test, expect } from '@playwright/test';
import { BatchPacer } from '../helpers/batch-pacing';

test('waits five seconds after closing the completed tab before the next account', async () => {
  let clock = 100;
  const waits: number[] = [];
  let closed = false;
  const pacer = new BatchPacer(() => clock, async (milliseconds) => {
    waits.push(milliseconds);
    clock += milliseconds;
  });

  await pacer.waitForNext();
  expect(waits).toEqual([]);
  await pacer.complete({ close: async () => { closed = true; } });
  expect(closed).toBe(true);
  clock += 1_000;
  await pacer.waitForNext();
  expect(waits).toEqual([4_000]);
  await pacer.waitForNext();
  expect(waits).toEqual([4_000]);
});

test('closes only the completed tab and keeps the browser and other tab open', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const completed = await context.newPage();
    const other = await context.newPage();
    await new BatchPacer().complete(completed);
    expect(completed.isClosed()).toBe(true);
    expect(other.isClosed()).toBe(false);
    expect(browser.isConnected()).toBe(true);
  } finally {
    await context.close();
  }
});
