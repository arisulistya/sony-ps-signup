import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Account = {
  email: string;
  onlineId: string;
  firstName: string;
  lastName: string;
  postcode: string;
  city: string;
  province: string;
  day: string;
  month: string;
  year: string;
  password: string; 
  verificationScreenSeen?: boolean;
  selectedOnlineId?: string;
};

const accountFile = () => process.env.SIGNUP_DATA_FILE ?? join(homedir(), '.config', 'sony-ps-signup', 'accounts.json');

async function loadAccounts(): Promise<Account[]> {
  const raw: unknown = JSON.parse(await readFile(accountFile(), 'utf8'));
  if (!Array.isArray(raw)) throw new Error('Signup data must be an array of accounts');
  const required = ['email', 'onlineId', 'firstName', 'lastName', 'postcode', 'city', 'province', 'day', 'month', 'year'];
  for (const account of raw) {
    if (!account || typeof account !== 'object' || required.some((key) => typeof account[key] !== 'string' || !account[key].trim())) {
      throw new Error('Signup data contains an incomplete account');
    }
  }
  return raw as Account[];
}

export async function nextAccount(): Promise<Account> {
  const accounts = await loadAccounts();
  const account = accounts.find((item) => !item.verificationScreenSeen);
  if (!account) throw new Error('No remaining accounts in the private signup data file');
  return account;
}

export async function markVerificationScreenSeen(email: string): Promise<void> {
  const accounts = await loadAccounts();
  const account = accounts.find((item) => item.email === email);
  if (!account) throw new Error('Account is missing from the private signup data file');
  account.verificationScreenSeen = true;
  await writeFile(accountFile(), JSON.stringify(accounts, null, 2) + '\n', { mode: 0o600 });
}

export async function saveSelectedOnlineId(email: string, selectedOnlineId: string): Promise<void> {
  if (!selectedOnlineId.trim()) throw new Error('Selected online ID cannot be empty');
  const accounts = await loadAccounts();
  const account = accounts.find((item) => item.email === email);
  if (!account) throw new Error('Account is missing from the private signup data file');
  account.selectedOnlineId = selectedOnlineId;
  await writeFile(accountFile(), JSON.stringify(accounts, null, 2) + '\n', { mode: 0o600 });
}
