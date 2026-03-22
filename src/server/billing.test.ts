import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { getSubscriptionPlan } from '../shared/billing';
import { buildSubscriptionCustomerPatch, toLocalSubscriptionStatus } from './billing';

describe('toLocalSubscriptionStatus', () => {
  it('treats active and trialing subscriptions as locally active', () => {
    expect(toLocalSubscriptionStatus('active')).toBe('active');
    expect(toLocalSubscriptionStatus('trialing')).toBe('active');
  });

  it('treats non-active Stripe statuses as locally inactive', () => {
    expect(toLocalSubscriptionStatus('past_due')).toBe('inactive');
    expect(toLocalSubscriptionStatus('canceled')).toBe('inactive');
    expect(toLocalSubscriptionStatus(null)).toBe('inactive');
  });
});

describe('buildSubscriptionCustomerPatch', () => {
  it('maps Stripe subscription details into persistent customer billing fields', () => {
    const premiumPlan = getSubscriptionPlan('premium-household');
    expect(premiumPlan).not.toBeNull();

    const patch = buildSubscriptionCustomerPatch(
      {
        id: 'customer-123',
        plan: '',
        stripeCustomerId: null,
        subscriptionActivatedAt: null,
      },
      {
        id: 'sub_123',
        status: 'active',
        customer: 'cus_123',
        start_date: 1_700_000_000,
        current_period_start: 1_700_000_000,
        current_period_end: 1_700_086_400,
        cancel_at_period_end: false,
        canceled_at: null,
        items: {
          data: [
            {
              price: {
                id: 'price_123',
                unit_amount: 5500,
                currency: 'usd',
                recurring: {
                  interval: 'month',
                },
              },
            },
          ],
        },
      } as unknown as Stripe.Subscription,
      {
        checkoutSessionId: 'cs_test_123',
        plan: premiumPlan,
      },
    );

    expect(patch.subscriptionStatus).toBe('active');
    expect(patch.plan).toBe('Premium Household');
    expect(patch.subscriptionPlanName).toBe('Premium Household');
    expect(patch.stripeCustomerId).toBe('cus_123');
    expect(patch.stripeSubscriptionId).toBe('sub_123');
    expect(patch.stripePriceId).toBe('price_123');
    expect(patch.subscriptionAmount).toBe(55);
    expect(patch.subscriptionCurrency).toBe('usd');
    expect(patch.subscriptionInterval).toBe('month');
    expect(patch.stripeCheckoutSessionId).toBe('cs_test_123');
    expect(patch.subscriptionCurrentPeriodStart).toBe('2023-11-14T22:13:20.000Z');
    expect(patch.subscriptionCurrentPeriodEnd).toBe('2023-11-15T22:13:20.000Z');
    expect(patch.subscriptionActivatedAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('preserves an existing activation timestamp when refreshing an active subscription', () => {
    const patch = buildSubscriptionCustomerPatch(
      {
        id: 'customer-456',
        plan: 'Standard Residential',
        stripeCustomerId: 'cus_existing',
        subscriptionActivatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'sub_existing',
        status: 'active',
        customer: 'cus_existing',
        start_date: 1_710_000_000,
        items: { data: [] },
      } as unknown as Stripe.Subscription,
    );

    expect(patch.subscriptionActivatedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(patch.plan).toBe('Standard Residential');
  });
});
