import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

export class BatchPacer {
  private nextStart = 0;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly wait: (milliseconds: number) => Promise<void> = sleep,
  ) {}

  async waitForNext(): Promise<void> {
    const remaining = this.nextStart - this.now();
    if (remaining > 0) await this.wait(Math.ceil(remaining));
  }

  async complete(page: { close(): Promise<void> }): Promise<void> {
    await page.close();
    this.nextStart = this.now() + 5_000;
  }
}
