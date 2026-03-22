import { describe, expect, it, vi } from 'vitest';
import { getBootstrapErrorMessage, runBootstrapWithRetry } from './bootstrapRecovery';

describe('runBootstrapWithRetry', () => {
  it('retries failed bootstrap attempts with exponential backoff', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValue('ok');
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();

    const result = await runBootstrapWithRetry(operation, {
      attempts: 3,
      baseDelayMs: 100,
      sleep,
    });

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it('throws the final error after the retry budget is exhausted', async () => {
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('bootstrap failed'));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();

    await expect(
      runBootstrapWithRetry(operation, {
        attempts: 3,
        baseDelayMs: 50,
        sleep,
      }),
    ).rejects.toThrow('bootstrap failed');

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe('getBootstrapErrorMessage', () => {
  it('falls back to a stable recovery message for unknown errors', () => {
    expect(getBootstrapErrorMessage(null)).toBe('Unable to restore your session right now.');
  });
});
