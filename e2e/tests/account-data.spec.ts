import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { markVerificationScreenSeen, nextAccount, saveSelectedOnlineId } from '../helpers/account-data';

test('uses the next account only after observing verification', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'signup-data-check-'));
  const path = join(dir, 'accounts.json');
  const original = process.env.SIGNUP_DATA_FILE;
  const sample = { onlineId: 'Example', firstName: 'Example', lastName: 'User', postcode: '00000', city: 'Example', province: 'Example', day: '1', month: '1', year: '2000' };
  try {
    process.env.SIGNUP_DATA_FILE = path;
    await writeFile(path, JSON.stringify([{ ...sample, email: 'first@example.test' }, { ...sample, email: 'second@example.test' }]));
    expect((await nextAccount()).email).toBe('first@example.test');
    await saveSelectedOnlineId('first@example.test', 'sample-willow34');
    expect((await nextAccount()).selectedOnlineId).toBe('sample-willow34');
    expect((await nextAccount()).email).toBe('first@example.test');
    await markVerificationScreenSeen('first@example.test');
    expect((await nextAccount()).email).toBe('second@example.test');
    const saved = JSON.parse(await readFile(path, 'utf8'));
    expect(saved[0].verificationScreenSeen).toBe(true);
    expect(saved[0].selectedOnlineId).toBe('sample-willow34');
    expect(saved[1].verificationScreenSeen).toBeUndefined();
  } finally {
    if (original === undefined) delete process.env.SIGNUP_DATA_FILE;
    else process.env.SIGNUP_DATA_FILE = original;
    await rm(dir, { recursive: true, force: true });
  }
});
