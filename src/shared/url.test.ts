import { describe, expect, it } from 'vitest';
import { appendQueryParams } from './url';

describe('appendQueryParams', () => {
  it('appends params to a URL without an existing query string', () => {
    expect(
      appendQueryParams('https://app.example.com/dashboard/payments', {
        payment_success: 'true',
        payment_id: 'payment-123',
      }),
    ).toBe('https://app.example.com/dashboard/payments?payment_success=true&payment_id=payment-123');
  });

  it('merges params into a URL that already contains query params', () => {
    expect(
      appendQueryParams('https://app.example.com/subscribe?plan=Premium%20Household&amount=55', {
        subscription_success: 'true',
        session_id: 'sess_123',
      }),
    ).toBe(
      'https://app.example.com/subscribe?plan=Premium+Household&amount=55&subscription_success=true&session_id=sess_123',
    );
  });
});
