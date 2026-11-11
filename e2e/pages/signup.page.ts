import type { Locator, Page } from '@playwright/test';

/** Visible milestones in Sony's signup journey. No credentials are captured. */
export class SignupPage {
  readonly verificationMessage: Locator;
  readonly doThisLater: Locator;
  readonly email: Locator;
  readonly onlineId: Locator;
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly emailPreference: Locator;
  readonly agreement: Locator;
  readonly nextButton: Locator;
  readonly suggestionsHeading: Locator;
  readonly suggestedOnlineIds: Locator;
  readonly personalisedContent: Locator;
  readonly passwordOption: Locator;

  constructor(private readonly page: Page) {
    // Sony exposes the active signup panel as main-layer; other copies can remain visible to Playwright.
    const signupPanel = page.locator('#main-layer');
    this.email = signupPanel.getByLabel(/email address|sign-in id/i).filter({ visible: true });
    this.onlineId = signupPanel.getByLabel(/online id/i).filter({ visible: true });
    this.firstName = signupPanel.getByPlaceholder('First name', { exact: true }).filter({ visible: true });
    this.lastName = signupPanel.getByPlaceholder('Last name', { exact: true }).filter({ visible: true });
    // Sony's custom checkbox has no Playwright-accessible name; its ID was observed on the form.
    this.emailPreference = signupPanel.locator('#sonyCommunications').filter({ visible: true });
    // Sony puts the checkbox inside a label and generates its input ID at runtime.
    this.agreement = signupPanel.locator('label').filter({ hasText: /I understand and agree to the terms of the following documents/i, visible: true }).locator('input[type="checkbox"]');
    this.nextButton = signupPanel.getByRole('button', { name: 'Next', exact: true });
    this.suggestionsHeading = signupPanel.getByText('Suggestions', { exact: true });
    // Sony's observed suggestions are buttons containing words separated by _ or -.
    this.suggestedOnlineIds = signupPanel.getByRole('button', { name: /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i });
    this.personalisedContent = page.getByRole('heading', { name: 'Personalised Content', exact: true });
    this.passwordOption = page.getByRole('button', { name: 'Sign In with Password', exact: true });
    this.verificationMessage = page.getByText(
      /verify (your )?email|verification email|email (has been )?sent|check your email/i,
    ).first();
    this.doThisLater = page.getByRole('link', { name: 'Do This Later', exact: true });
  }

  async open(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async startSignup(): Promise<void> {
    await this.page.getByRole('button', { name: 'Create an Account' }).click();
    await this.page.getByRole('combobox', { name: 'United Kingdom' }).selectOption({ label: 'Indonesia' });
    await this.page.getByRole('combobox', { name: 'Country or region' }).selectOption({ label: 'Indonesia' });
  }

  async fillPersonalInfo(data: { postcode: string; city: string; province: string; day: string; month: string; year: string }): Promise<void> {
    await this.page.getByLabel('Postcode').fill(data.postcode);
    await this.page.getByLabel('City', { exact: true }).fill(data.city);
    await this.page.getByLabel('State or province').fill(data.province);
    await this.page.getByRole('combobox', { name: 'Day', exact: true }).selectOption({ label: data.day });
    await this.page.getByRole('combobox', { name: 'Month', exact: true }).selectOption({ label: data.month });
    await this.page.getByRole('combobox', { name: 'Year', exact: true }).selectOption({ label: data.year });
    await this.page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  async fillIdentity(data: { email: string; onlineId: string; firstName: string; lastName: string }): Promise<void> {
    await this.email.fill(data.email);
    await this.onlineId.fill(data.onlineId);
    await this.firstName.fill(data.firstName);
    await this.lastName.fill(data.lastName);
    if (!(await this.emailPreference.isChecked())) {
      // Sony's custom visual control can intercept pointer clicks; its input is keyboard focusable.
      await this.emailPreference.focus();
      await this.emailPreference.press('Space');
    }
  }

  async confirmPersonalisedContent(): Promise<void> {
    await this.page.getByRole('button', { name: 'Confirm', exact: true }).click();
  }

  // Example only: provide the password outside the repository.
  async fillPassword(password: string): Promise<void> {
    await this.page.getByLabel('Password', { exact: true }).fill(password);
  }

  // Example only: the final account-creation button at password setup.
  async submitAccount(): Promise<void> {
    await this.page.getByRole('button', { name: 'Create an Account', exact: true }).click();
  }

  async selectSuggestedOnlineId(): Promise<string> {
    const suggestion = this.suggestedOnlineIds.first();
    const id = (await suggestion.innerText()).trim();
    await suggestion.click();
    return id;
  }
}
