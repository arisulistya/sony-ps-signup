import { test, liveTest, expect } from '../fixtures/signup.fixture';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { markVerificationScreenSeen, nextAccount, saveSelectedOnlineId, type Account } from '../helpers/account-data';
import { saveBatchSuccess } from '../helpers/output-data';
import type { SignupPage } from '../pages/signup.page';
import { runWithSonyErrorRetry } from '../helpers/signup-retry';

test('clears cache before opening signup', async ({ page, signup }) => {
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/') requests += 1;
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' });
    response.end('<h1>Signup</h1>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No local server address');
    const url = `http://127.0.0.1:${address.port}/`;
    await page.goto(url);
    await page.goto(url);
    expect(requests).toBe(1);
    await signup.open(url);
    await expect(page.getByRole('heading', { name: 'Signup' })).toBeVisible();
    expect(requests).toBe(2);
    await signup.clearCacheAndHardReload();
    await expect(page.getByRole('heading', { name: 'Signup' })).toBeVisible();
    expect(requests).toBe(3);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('recognizes a Sony error without confusing verification', async ({ page, signup }) => {
  await page.setContent('<h1>Something went wrong</h1>');
  await expect(signup.sonyError).toBeVisible();
  await expect(signup.verificationMessage).toBeHidden();
  await page.setContent('<h1>Check your email</h1>');
  await expect(signup.verificationMessage).toBeVisible();
  await expect(signup.sonyError).toBeHidden();
});

test('retries Sony errors and stops after three attempts', async () => {
  const events: string[] = [];
  await runWithSonyErrorRetry(async (number) => {
    events.push(`attempt ${number}`);
    return number < 3 ? 'sony-error' : 'verification';
  }, async () => { events.push('recover'); });
  expect(events).toEqual(['attempt 1', 'recover', 'attempt 2', 'recover', 'attempt 3']);
  events.length = 0;
  await expect(runWithSonyErrorRetry(async (number) => {
    events.push(`attempt ${number}`);
    return 'sony-error';
  }, async () => { events.push('recover'); })).rejects.toThrow('after all three signup attempts');
  expect(events).toEqual(['attempt 1', 'recover', 'attempt 2', 'recover', 'attempt 3']);
});

test('selects email preference and recognizes verification', async ({ page, signup }) => {
  await page.setContent('<main><section><label>Email address <input></label><label>Online ID <input></label><input placeholder="First name"><input placeholder="Last name"></section><section id="main-layer"><label>Email address <input></label><label>Online ID <input></label><input placeholder="First name"><input placeholder="Last name"><input type="checkbox" id="sonyCommunications" style="position:absolute;opacity:0"><label for="sonyCommunications">Receive via Email</label></section><h1>Check your email</h1></main>');
  await signup.fillIdentity({ email: 'example@example.test', onlineId: 'Example', firstName: 'Example', lastName: 'User' });
  await expect(signup.onlineId).toHaveValue('Example');
  await expect(signup.firstName).toHaveValue('Example');
  await expect(signup.lastName).toHaveValue('User');
  await expect(page.locator('section').first().getByPlaceholder('First name')).toHaveValue('');
  await expect(signup.emailPreference).toBeChecked();
  await signup.fillIdentity({ email: 'example@example.test', onlineId: 'Example', firstName: 'Example', lastName: 'User' });
  await expect(signup.emailPreference).toBeChecked();
  await expect(signup.verificationMessage).toBeVisible();
});

test('selects a displayed ID suggestion', async ({ page, signup }) => {
  await page.setContent('<div id="main-layer"><label>Online ID <input id="online-id"></label><p>Suggestions</p><button onclick="document.getElementById(\'online-id\').value = this.textContent">sample-willow34</button><button onclick="document.getElementById(\'online-id\').value = this.textContent">second_choice55</button></div>');
  await expect(signup.suggestionsHeading).toBeVisible();
  const id = await signup.selectSuggestedOnlineId();
  expect(id).toBe('sample-willow34');
  await expect(signup.onlineId).toHaveValue(id);
});

test('defers email verification after the verification screen appears', async ({ page, signup }) => {
  await page.setContent(`<section id="verify"><h1>Verify Your Email Address</h1>
    <a href="#" onclick="document.getElementById('verify').hidden=true;document.getElementById('signin').hidden=false;return false">Do This Later</a>
  </section><h1 id="signin" hidden>Sign in to PlayStation</h1>`);
  await expect(signup.verificationMessage).toBeVisible();
  await signup.doThisLater.click();
  await expect(signup.doThisLater).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Sign in to PlayStation' })).toBeVisible();
});

test('waits for duplicate identity fields to settle', async ({ page, signup }) => {
  await page.setContent('<div id="main-layer"><label>Email address <input></label><div id="transition"><label>Email address <input></label></div><button onclick="document.getElementById(\'transition\').remove()">Finish transition</button></div>');
  await expect(signup.email).toHaveCount(2);
  const oneEmail = expect(signup.email).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish transition' }).click();
  await oneEmail;
  await signup.email.fill('example@example.test');
  await expect(signup.email).toHaveValue('example@example.test');
});

test('detects the agreement checkbox without relying on its generated ID', async ({ page, signup }) => {
  await page.setContent('<div id="main-layer"><label for="input-846"><input id="input-846" type="checkbox" aria-labelledby="agreement-text"><span aria-hidden="true"><span id="agreement-text">I understand and agree to the terms of the following documents and confirm that the information I\'ve provided is accurate.</span></span></label></div>');
  // await expect(signup.agreement).not.toBeChecked();
  await page.getByText('I understand and agree to the terms', { exact: false }).click();
  await expect(signup.agreement).toBeChecked();
});

test('continues from a selected ID to password setup', async ({ page, signup }) => {
  await page.setContent(`<main><div id="main-layer">
    <button onclick="this.hidden=true;document.getElementById('personal').hidden=false">Next</button>
    <section id="personal" hidden><h1>Personalised Content</h1>
      <button onclick="document.getElementById('personal').hidden=true;document.getElementById('password').hidden=false">Confirm</button>
    </section>
    <button id="password" hidden>Sign In with Password</button>
  </div></main>`);
  await signup.nextButton.click();
  await expect(signup.personalisedContent).toBeVisible();
  await signup.confirmPersonalisedContent();
  await expect(signup.passwordOption).toBeVisible();
});

async function runSignup(signup: SignupPage, account: Account, batchOutput?: string): Promise<void> {
  test.setTimeout(45 * 60_000);
  await runWithSonyErrorRetry(async (number) => {
    console.log(`Signup attempt ${number} of 3 for ${account.email}.`);
    return runSignupAttempt(signup, account, number, batchOutput);
  }, async () => {
    console.log('Sony showed an error; clearing cache and hard-reloading before retrying.');
    await signup.clearCacheAndHardReload();
  });
}

async function runSignupAttempt(signup: SignupPage, account: Account, attempt: number, batchOutput?: string): Promise<'verification' | 'sony-error'> {
  const url = process.env.SONY_SIGNUP_URL ?? 'https://www.playstation.com/acct/create-account';
  console.log(`Starting signup for ${account.email}`);
  let selectedId = '';

  await test.step('Open signup and fill location and birth date', async () => {
    if (process.env.RESUME_SIGNUP !== '1' || attempt > 1) {
      console.log(`Clearing Chrome cache before opening signup for ${account.email}.`);
      await signup.open(url!);
      console.log(`Cache cleared and signup page opened for ${account.email}.`);
      await signup.startSignup();
    }
    await signup.fillPersonalInfo(account);
  });
//test
  await test.step('Fill the identity fields', async () => {
    // Sony may temporarily keep two rendered forms inside main-layer during transitions.
    for (const field of [signup.email, signup.onlineId, signup.firstName, signup.lastName, signup.emailPreference]) {
      await expect(field).toHaveCount(1, { timeout: 5 * 60_000 });
    }
    await expect(signup.email).toBeVisible({ timeout: 5 * 60_000 });
    await signup.fillIdentity(account);
    await expect(signup.emailPreference).toBeChecked();
    console.log('Review and select Sony’s agreement checkbox in Chrome.');
    if (!(await signup.agreement.isChecked())) {
      await signup.agreement.focus();
      await signup.agreement.press('Space');
    }
    await expect(signup.agreement).toBeChecked({ timeout: 5 * 60_000 });
    await expect(signup.nextButton).toBeEnabled({ timeout: 5 * 60_000 });
    await signup.nextButton.click();
  });

  await test.step('Select and save a suggested online ID', async () => {
    await expect(signup.suggestionsHeading).toBeVisible({ timeout: 5 * 60_000 });
    await expect(signup.suggestedOnlineIds.first()).toBeVisible();
    selectedId = await signup.selectSuggestedOnlineId();
    await expect(signup.onlineId).toHaveValue(selectedId);
    if (!batchOutput) await saveSelectedOnlineId(account.email, selectedId);
    console.log(`Selected and saved online ID: ${selectedId}.`);
    await expect(signup.nextButton).toBeEnabled();
    await signup.nextButton.click();
  });

  await test.step('Continue to password setup', async () => {
    await expect(signup.personalisedContent.or(signup.passwordOption).first()).toBeVisible({ timeout: 60_000 });
    if (await signup.personalisedContent.isVisible()) {
      await signup.confirmPersonalisedContent();
    }
    await expect(signup.passwordOption).toBeVisible({ timeout: 60_000 });
    await signup.passwordOption.click();
    // Example only: also requires the commented Account field and fillPassword method.
    const password = account.password;
    if (!password) throw new Error('Password is missing from the private account data.');
    await signup.fillPassword(password);
    // Example only; also requires the commented submitAccount method in signup.page.ts.
    console.log('Waiting 5 seconds before creating the account.');
    await sleep(5_000);
    await signup.submitAccount();
    console.log('Enter and submit the password in Chrome to create the account.');
  });

  return test.step('Observe the email verification screen', async () => {
    await expect(signup.verificationMessage.or(signup.sonyError).filter({ visible: true }).first()).toBeVisible({ timeout: 14 * 60_000 });
    if (!(await signup.verificationMessage.isVisible())) return 'sony-error';
    // Record the observed account state before deferring, so a later navigation error does not lose it.
    if (batchOutput) await saveBatchSuccess(batchOutput, account, selectedId);
    else await markVerificationScreenSeen(account.email);
    await signup.doThisLater.click({ timeout: 30_000 });
    await expect(signup.doThisLater).toBeHidden({ timeout: 30_000 });
    return 'verification';
  });
}

const batchInput = process.env.SIGNUP_BATCH_INPUT;
if (batchInput) {
  const batchOutput = process.env.SIGNUP_BATCH_OUTPUT;
  if (!batchOutput) throw new Error('SIGNUP_BATCH_OUTPUT is required for batch tests');
  const accounts: Account[] = JSON.parse(readFileSync(batchInput, 'utf8'));
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('Batch input must contain accounts');
  for (const account of accounts) {
    liveTest(`Sony signup ${account.email} reaches email verification @live`, async ({ signup }) => {
      await runSignup(signup, account, batchOutput);
    });
  }
} else {
  liveTest('Sony signup reaches email verification @live', async ({ signup }) => {
    await runSignup(signup, await nextAccount());
  });
}
