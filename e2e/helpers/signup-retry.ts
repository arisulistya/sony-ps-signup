export async function runWithSonyErrorRetry(
  attempt: (number: number) => Promise<'verification' | 'sony-error'>,
  recover: () => Promise<void>,
): Promise<void> {
  for (let number = 1; number <= 3; number++) {
    if (await attempt(number) === 'verification') return;
    if (number === 3) throw new Error('Sony displayed an error after all three signup attempts.');
    await recover();
  }
}
