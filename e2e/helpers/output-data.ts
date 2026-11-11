import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import type { Account } from './account-data';

export async function saveBatchSuccess(outputPath: string, account: Account, selectedOnlineId: string): Promise<void> {
  if (!selectedOnlineId.trim()) throw new Error('Selected online ID cannot be empty');
  const results: unknown = JSON.parse(await readFile(outputPath, 'utf8'));
  if (!Array.isArray(results)) throw new Error('Batch output must be an array');
  if (results.some((item) => item?.email === account.email)) throw new Error('Account already recorded in batch output');
  results.push({ ...account, selectedOnlineId, verificationScreenSeen: true });
  const temporary = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, outputPath);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
