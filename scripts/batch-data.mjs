import { mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const batchName = /^accounts-(\d+)\.json$/;
const emailPattern = /^ps5-(\d+)-c@desent\.io$/i;
const sharedFields = ['onlineId', 'firstName', 'postcode', 'city', 'province', 'day', 'month', 'year', 'password'];

export function parseArguments(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!['--start', '--count'].includes(flag) || values[flag] !== undefined || !/^\d+$/.test(args[i + 1] ?? '')) {
      throw new Error('Usage: npm run test:batch -- --count <positive integer> [--start <positive integer>]');
    }
    const number = Number(args[i + 1]);
    if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${flag} must be a positive integer`);
    values[flag] = number;
  }
  if (!values['--count']) throw new Error('--count is required');
  return { start: values['--start'], count: values['--count'] };
}

async function createExclusive(path, content) {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(`${JSON.stringify(content, null, 2)}\n`);
  } finally {
    await file.close();
  }
}

export async function createBatch(root, options) {
  const inputDir = join(root, 'e2e', 'test-data');
  const outputDir = join(root, 'e2e', 'output-data');
  const templatePath = join(inputDir, 'template.json');
  await mkdir(inputDir, { recursive: true, mode: 0o700 });
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  let template;
  try {
    template = JSON.parse(await readFile(templatePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing shared template: ${templatePath}`);
    throw error;
  }
  if (!template || typeof template !== 'object' || sharedFields.some((key) => typeof template[key] !== 'string' || !template[key].trim())) {
    throw new Error('Shared template is missing a required field');
  }
  const inputNames = await readdir(inputDir);
  const outputNames = await readdir(outputDir);
  let highestBatch = 0;
  let highestAccount = 0;
  const existingEmails = new Set();
  for (const name of [...inputNames, ...outputNames]) {
    const match = batchName.exec(name);
    if (match) highestBatch = Math.max(highestBatch, Number(match[1]));
  }
  for (const [directory, names] of [[inputDir, inputNames], [outputDir, outputNames]]) {
    for (const name of names.filter((entry) => batchName.test(entry))) {
      const accounts = JSON.parse(await readFile(join(directory, name), 'utf8'));
      if (!Array.isArray(accounts)) throw new Error(`Invalid batch data: ${name}`);
      for (const account of accounts) {
        if (!account || typeof account.email !== 'string') throw new Error(`Invalid account in ${name}`);
        existingEmails.add(account.email.toLowerCase());
        const match = emailPattern.exec(account.email);
        if (match) highestAccount = Math.max(highestAccount, Number(match[1]));
      }
    }
  }
  const start = options.start ?? highestAccount + 1;
  if (!Number.isSafeInteger(start + options.count - 1)) throw new Error('Requested account range is too large');
  const shared = Object.fromEntries(sharedFields.map((key) => [key, template[key]]));
  const accounts = Array.from({ length: options.count }, (_, index) => {
    const number = start + index;
    const email = `ps5-${number}-c@desent.io`;
    if (existingEmails.has(email.toLowerCase())) throw new Error(`Account already exists in a previous batch: ${email}`);
    return { email, ...shared, lastName: 'Customer' };
  });
  const name = `accounts-${String(highestBatch + 1).padStart(3, '0')}.json`;
  const inputPath = join(inputDir, name);
  const outputPath = join(outputDir, name);
  await createExclusive(inputPath, accounts);
  try {
    await createExclusive(outputPath, []);
  } catch (error) {
    await unlink(inputPath);
    throw error;
  }
  return { inputPath, outputPath, accounts };
}
