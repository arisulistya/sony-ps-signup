import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveBatchSuccess } from '../helpers/output-data';

test('records only completed accounts and preserves previous results', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'signup-output-check-'));
  const path = join(dir, 'accounts.json');
  const account = { email: 'first@example.test', onlineId: 'Example', firstName: 'Example', lastName: 'User', postcode: '00000', city: 'Example', province: 'Example', day: '1', month: '1', year: '2000', password: 'synthetic' };
  try {
    await writeFile(path, '[]');
    await saveBatchSuccess(path, account, 'example-tree12');
    await expect(saveBatchSuccess(path, account, 'example-tree12')).rejects.toThrow('already recorded');
    const results = JSON.parse(await readFile(path, 'utf8'));
    expect(results).toEqual([{ ...account, selectedOnlineId: 'example-tree12', verificationScreenSeen: true }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
