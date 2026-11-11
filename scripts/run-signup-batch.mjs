import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createBatch, parseArguments } from './batch-data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const options = parseArguments(process.argv.slice(2));
  const batch = await createBatch(root, options);
  console.log(`Created input: ${batch.inputPath}\nCreated output: ${batch.outputPath}\nRunning ${batch.accounts.length} signup tests.`);
  const cli = join(root, 'node_modules', '@playwright', 'test', 'cli.js');
  const child = spawn(process.execPath, [cli, 'test', 'e2e/tests/signup.spec.ts', '--grep', '@live', '--headed', '--workers=1', '--retries=0', '--max-failures=1'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, RESUME_SIGNUP: '0', SIGNUP_BATCH_INPUT: batch.inputPath, SIGNUP_BATCH_OUTPUT: batch.outputPath },
  });
  const status = await new Promise((resolveStatus, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveStatus(code ?? (signal ? 1 : 0)));
  });
  if (status !== 0) console.error(`Batch stopped. Completed results remain in ${batch.outputPath}.`);
  process.exitCode = status;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
