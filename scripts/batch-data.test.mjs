import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createBatch, parseArguments } from './batch-data.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = { onlineId: 'Example', firstName: 'Example', postcode: '00000', city: 'Example', province: 'Example', day: '1', month: '1', year: '2000', password: 'synthetic' };

async function tempProject() {
  const root = await mkdtemp(join(tmpdir(), 'signup-batch-test-'));
  await mkdir(join(root, 'e2e', 'test-data'), { recursive: true });
  await writeFile(join(root, 'e2e', 'test-data', 'template.json'), JSON.stringify(template));
  return root;
}

test('validates batch arguments', () => {
  assert.deepEqual(parseArguments(['--start', '5', '--count', '10']), { start: 5, count: 10 });
  for (const args of [[], ['--count', '0'], ['--count', '-1'], ['--count', '1.5'], ['--start', '5'], ['--count', '1', '--count', '2'], ['--other', '1']]) {
    assert.throws(() => parseArguments(args));
  }
});

test('generates the requested range, preserves batches and rejects collisions', async () => {
  const root = await tempProject();
  try {
    const first = await createBatch(root, { start: 5, count: 10 });
    assert.equal(first.accounts.length, 10);
    assert.equal(first.accounts[0].email, 'ps5-5-c@desent.io');
    assert.equal(first.accounts[0].lastName, 'Customer');
    assert.equal(first.accounts[9].email, 'ps5-14-c@desent.io');
    assert.equal(first.accounts[9].lastName, 'Customer');
    assert.ok(first.accounts.every((account) => account.lastName === 'Customer'));
    const original = await readFile(first.inputPath, 'utf8');
    assert.deepEqual(JSON.parse(await readFile(first.outputPath, 'utf8')), []);
    await assert.rejects(createBatch(root, { start: 14, count: 2 }), /previous batch/);
    const second = await createBatch(root, { count: 2 });
    assert.equal(second.accounts[0].email, 'ps5-15-c@desent.io');
    assert.match(second.inputPath, /accounts-002\.json$/);
    assert.match(second.outputPath, /accounts-002\.json$/);
    assert.equal(await readFile(first.inputPath, 'utf8'), original);
    assert.deepEqual(JSON.parse(await readFile(first.outputPath, 'utf8')), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('defaults to account 1 and checks surviving output records for collisions', async () => {
  const root = await tempProject();
  try {
    const batch = await createBatch(root, { count: 1 });
    assert.equal(batch.accounts[0].email, 'ps5-1-c@desent.io');
    await writeFile(batch.outputPath, JSON.stringify([{ ...batch.accounts[0], verificationScreenSeen: true }]));
    await rm(batch.inputPath);
    await assert.rejects(createBatch(root, { start: 1, count: 1 }), /previous batch/);
    const next = await createBatch(root, { count: 1 });
    assert.equal(next.accounts[0].email, 'ps5-2-c@desent.io');
    assert.match(next.inputPath, /accounts-002\.json$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('discovers one live test per generated account without opening Sony', async () => {
  const root = await tempProject();
  try {
    const batch = await createBatch(root, { start: 5, count: 10 });
    const cli = join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js');
    const { stdout } = await execFileAsync(process.execPath, [cli, 'test', 'e2e/tests/signup.spec.ts', '--list', '--grep', '@live'], {
      cwd: projectRoot,
      env: { ...process.env, SIGNUP_BATCH_INPUT: batch.inputPath, SIGNUP_BATCH_OUTPUT: batch.outputPath },
    });
    assert.match(stdout, /Total: 10 tests/);
    for (let index = 5; index <= 14; index++) assert.ok(stdout.includes(`ps5-${index}-c@desent.io`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stops after a synthetic failure and keeps earlier successful results', async () => {
  const root = await tempProject();
  try {
    const batch = await createBatch(root, { start: 5, count: 10 });
    const playwright = join(projectRoot, 'node_modules', '@playwright', 'test');
    const outputHelper = join(projectRoot, 'e2e', 'helpers', 'output-data.ts');
    const configPath = join(root, 'playwright.config.cjs');
    const specPath = join(root, 'batch.spec.cjs');
    await writeFile(configPath, 'module.exports = { testDir: __dirname, testMatch: "batch.spec.cjs", reporter: "list" };');
    await writeFile(specPath, `
      const { test, expect } = require(${JSON.stringify(playwright)});
      const { saveBatchSuccess } = require(${JSON.stringify(outputHelper)});
      const fs = require('node:fs');
      const accounts = JSON.parse(fs.readFileSync(process.env.SIGNUP_BATCH_INPUT, 'utf8'));
      accounts.forEach((account, index) => {
        test('synthetic account ' + index, async () => {
          expect(index, 'synthetic failure').not.toBe(2);
          await saveBatchSuccess(process.env.SIGNUP_BATCH_OUTPUT, account, 'sample-id' + index);
        });
      });
    `);
    const cli = join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js');
    let failure;
    try {
      await execFileAsync(process.execPath, [cli, 'test', '--config', configPath, '--workers=1', '--retries=0', '--max-failures=1'], {
        cwd: projectRoot,
        env: { ...process.env, SIGNUP_BATCH_INPUT: batch.inputPath, SIGNUP_BATCH_OUTPUT: batch.outputPath },
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, 'Expected the synthetic third test to fail');
    assert.match(failure.stdout, /synthetic failure/);
    const results = JSON.parse(await readFile(batch.outputPath, 'utf8'));
    assert.deepEqual(results.map((item) => item.email), ['ps5-5-c@desent.io', 'ps5-6-c@desent.io']);
    assert.ok(results.every((item) => item.verificationScreenSeen === true && item.selectedOnlineId));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('combined runner creates a pair and passes sequential stop-on-failure settings', async () => {
  const root = await tempProject();
  try {
    await mkdir(join(root, 'scripts'), { recursive: true });
    const cliDir = join(root, 'node_modules', '@playwright', 'test');
    await mkdir(cliDir, { recursive: true });
    for (const name of ['run-signup-batch.mjs', 'batch-data.mjs']) {
      await copyFile(join(projectRoot, 'scripts', name), join(root, 'scripts', name));
    }
    await writeFile(join(cliDir, 'cli.js'), `
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      if (!['--headed', '--workers=1', '--retries=0', '--max-failures=1'].every(flag => args.includes(flag))) process.exit(9);
      const accounts = JSON.parse(fs.readFileSync(process.env.SIGNUP_BATCH_INPUT, 'utf8'));
      fs.writeFileSync(process.env.SIGNUP_BATCH_OUTPUT, JSON.stringify([{ ...accounts[0], selectedOnlineId: 'sample-id1', verificationScreenSeen: true }]));
      process.exit(1);
    `);
    let failure;
    try {
      await execFileAsync(process.execPath, [join(root, 'scripts', 'run-signup-batch.mjs'), '--start', '5', '--count', '10']);
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.code, 1);
    assert.match(failure.stderr, /Batch stopped/);
    const input = JSON.parse(await readFile(join(root, 'e2e', 'test-data', 'accounts-001.json'), 'utf8'));
    const output = JSON.parse(await readFile(join(root, 'e2e', 'output-data', 'accounts-001.json'), 'utf8'));
    assert.equal(input.length, 10);
    assert.equal(output.length, 1);
    assert.equal(output[0].email, 'ps5-5-c@desent.io');
    assert.equal(output[0].verificationScreenSeen, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
