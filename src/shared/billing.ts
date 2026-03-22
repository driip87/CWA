export const SUBSCRIPTION_PLANS = [
  {
    id: 'standard-residential',
    name: 'Standard Residential',
    amount: 35,
    interval: 'month',
    description: 'Weekly curbside pickup with one trash bin and one recycle bin.',
    features: ['Weekly Curbside Pickup', '1x 96-Gallon Trash Bin', '1x 64-Gallon Recycle Bin'],
  },
  {
    id: 'premium-household',
    name: 'Premium Household',
    amount: 55,
    interval: 'month',
    description: 'Expanded weekly pickup with extra bins and priority support.',
    features: [
      'Weekly Curbside Pickup',
      '2x 96-Gallon Trash Bins',
      '2x 64-Gallon Recycle Bins',
      'Priority Customer Support',
    ],
  },
] as const;

export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];
export type SubscriptionPlanId = SubscriptionPlan['id'];

export function getSubscriptionPlan(planId: string | null | undefined): SubscriptionPlan | null {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === planId) || null;
}
