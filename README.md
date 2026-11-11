# PlayStation signup automation

This project generates numbered account records and runs a headed Playwright
signup test for each record in an existing Google Chrome profile. The batch stops
on the first failure and preserves results already recorded.

## 1. Install prerequisites

- macOS and Google Chrome with the profile you intend to use.
- Node.js 22 or later and npm. Check with `node --version` and `npm --version`.
- Access to the email addresses used for the accounts.

## 2. Clone and install

```sh
git clone https://github.com/arisulistya/sony-ps-signup.git
cd sony-ps-signup
npm ci
```

The project uses the installed Google Chrome application. Install Chrome from
Google's official site if it is not already present.

## 3. Create the local account template

Create the local data directories:

```sh
mkdir -p e2e/test-data e2e/output-data
```

Create `e2e/test-data/template.json` with the shared account fields:

```json
{
  "onlineId": "Example",
  "firstName": "Example",
  "postcode": "00000",
  "city": "Example",
  "province": "Example",
  "day": "1",
  "month": "1",
  "year": "2000",
  "password": "REPLACE_WITH_A_PASSWORD"
}
```

Replace the example values with the account details you are authorized to use.
All values must be nonempty strings. The generator supplies the email and the
last name `Customer` for each record. The template and generated records contain
plaintext account details and passwords. They are Git-ignored and must be created
locally after cloning.

## 4. Connect your Chrome profile

1. Open Chrome in the profile you want Playwright to use.
2. Open `chrome://inspect/#remote-debugging` and enable remote debugging for the
   browser instance.
3. When the test requests a connection, click **Allow** in Chrome.

The live test connects to the existing Chrome instance, including its signed-in
sessions. Keep that browser open while the batch runs.

## 5. Run a batch

```sh
npm run test:batch -- --start 5 --count 10
```

This creates ten records numbered 5 through 14, with emails following
`ps5-<number>-c@desent.io`. `--count` is required. Omit `--start` to continue after
the highest number in existing local batches, or start at 1 if there are none:

```sh
npm run test:batch -- --count 10
```

Playwright runs one headed test per account, sequentially, with no retries. The
signup flow selects the requested communication preference, submits the agreement
and account-creation forms, and selects a suggested online ID when `onlineId` is
unavailable. Review the Sony terms and the test behavior before running it. The
test waits five seconds before the final account-creation click.

## 6. Review batch files and results

Each batch creates a new matching pair without overwriting previous batches:

```text
e2e/test-data/accounts-001.json    # generated input
e2e/output-data/accounts-001.json  # results observed for that batch
```

The output is updated after each account reaches Sony's email-verification
screen. It includes Sony's selected online ID and `verificationScreenSeen: true`.
The test records this state before selecting **Do This Later**. Reaching that
screen does not mean the email has been verified.

After **Do This Later**, the completed signup tab closes and the test waits five
seconds before the next account. Chrome and other tabs stay open. On a failure,
the runner stops, preserves earlier results and leaves the failed tab open. There
is no automatic resume: compare the input and output before trying a failed or
unattempted account again.

The generator rejects email ranges found in earlier local batch files. It cannot
detect an email already registered directly with Sony. Confirm account status
before retrying; do not run two live batches concurrently.

## 7. Run local checks

These checks use local fixtures and do not create Sony accounts:

```sh
npm run typecheck
npm run lint
npm test
npm run test:batch-data
```

The legacy `npm run test:live` command uses the first unfinished record from
`~/.config/sony-ps-signup/accounts.json`, or from `SIGNUP_DATA_FILE` if supplied.
The default signup entry URL can be overridden with `SONY_SIGNUP_URL`. Sony may
change its flow or wording; local tests do not establish that live signup works.
Traces, screenshots and video are disabled in the Playwright configuration.

If Chrome cannot connect, check that remote debugging is enabled and approve the
Chrome prompt. If Sony rejects a request, inspect its on-screen error and the
response code; avoid sharing passwords, cookies, tokens or full request bodies.
