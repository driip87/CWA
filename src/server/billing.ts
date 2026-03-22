import Stripe from 'stripe';
import type { CustomerProfile } from '../shared/customer';
import { getSubscriptionPlan, type SubscriptionPlan } from '../shared/billing';
import { DEFAULT_TENANT_ID } from '../shared/unified';
import { adminDb } from './firebaseAdmin';
import { settleBalancePaymentForCustomer } from './payments';

type BillingCustomerRecord = CustomerProfile & {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePriceId?: string | null;
  billingProvider?: string | null;
  subscriptionPlanName?: string | null;
  subscriptionAmount?: number | null;
  subscriptionCurrency?: string | null;
  subscriptionInterval?: string | null;
  subscriptionCurrentPeriodStart?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  subscriptionCancelAtPeriodEnd?: boolean;
  subscriptionCanceledAt?: string | null;
  subscriptionActivatedAt?: string | null;
  subscriptionUpdatedAt?: string | null;
};

type StripeInvoiceWithLines = Stripe.Invoice & {
  paid?: boolean;
  subscription?: string | Stripe.Subscription | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
  lines?: {
    data?: Array<{
      description?: string | null;
      price?: {
        id?: string | null;
        recurring?: {
          interval?: string | null;
        } | null;
      } | null;
    }>;
  };
};

type StripeSubscriptionWithPeriods = Stripe.Subscription & {
  current_period_start?: number | null;
  current_period_end?: number | null;
};

type SubscriptionSyncOptions = {
  checkoutSessionId?: string | null;
  plan?: SubscriptionPlan | null;
};

function nowIso() {
  return new Date().toISOString();
}

function unixToIso(value?: number | null) {
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}

function readStripeId<T extends { id: string }>(value: string | T | null | undefined) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function isLocallyActiveSubscription(status: string | null | undefined) {
  return status === 'active' || status === 'trialing';
}

function toLocalSubscriptionStatus(status: string | null | undefined) {
  return isLocallyActiveSubscription(status) ? 'active' : 'inactive';
}

function paymentDocIdForInvoice(invoiceId: string) {
  return `stripe_invoice_${invoiceId}`;
}

function subscriptionDescription(planName: string | null | undefined) {
  return planName ? `${planName} Subscription` : 'Subscription Invoice';
}

async function getCustomerRecord(customerId: string) {
  const snap = await adminDb.collection('users').doc(customerId).get();
  if (!snap.exists) {
    throw new Error('Customer profile not found');
  }
  return { id: snap.id, ...(snap.data() as BillingCustomerRecord) };
}

async function findCustomerRecordByField(field: string, value: string) {
  const snapshot = await adminDb.collection('users').where(field, '==', value).limit(1).get();
  if (snapshot.empty) {
    return null;
  }
  const doc = snapshot.docs[0]!;
  return { id: doc.id, ...(doc.data() as BillingCustomerRecord) };
}

async function findCustomerForStripeObjects(params: {
  customerId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  if (params.customerId) {
    return getCustomerRecord(params.customerId);
  }
  if (params.stripeSubscriptionId) {
    const bySubscription = await findCustomerRecordByField('stripeSubscriptionId', params.stripeSubscriptionId);
    if (bySubscription) return bySubscription;
  }
  if (params.stripeCustomerId) {
    return findCustomerRecordByField('stripeCustomerId', params.stripeCustomerId);
  }
  return null;
}

async function ensureStripeCustomer(stripe: Stripe, customer: BillingCustomerRecord) {
  if (customer.stripeCustomerId) {
    return customer.stripeCustomerId;
  }

  const stripeCustomer = await stripe.customers.create({
    email: customer.email || undefined,
    name: customer.name || undefined,
    metadata: {
      customerId: customer.id || '',
      tenantId: customer.tenantId || DEFAULT_TENANT_ID,
    },
  });

  await adminDb.collection('users').doc(customer.id!).set(
    {
      billingProvider: 'stripe',
      stripeCustomerId: stripeCustomer.id,
      subscriptionUpdatedAt: nowIso(),
    },
    { merge: true },
  );

  return stripeCustomer.id;
}

function buildSubscriptionCustomerPatch(
  current: BillingCustomerRecord,
  subscription: Stripe.Subscription,
  options: SubscriptionSyncOptions = {},
) {
  const subscriptionWithPeriods = subscription as StripeSubscriptionWithPeriods;
  const firstItem = subscription.items.data[0];
  const price = firstItem?.price;
  const interval = price?.recurring?.interval || null;
  const amountFromPrice = typeof price?.unit_amount === 'number' ? price.unit_amount / 100 : null;
  const stripeStatus = subscription.status || null;
  const nextStatus = toLocalSubscriptionStatus(stripeStatus);
  const now = nowIso();
  const planName = options.plan?.name || current.subscriptionPlanName || current.plan || null;

  return {
    billingProvider: 'stripe',
    stripeCustomerId: readStripeId(subscription.customer) || current.stripeCustomerId || null,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: stripeStatus,
    stripeCheckoutSessionId: options.checkoutSessionId || current.stripeCheckoutSessionId || null,
    stripePriceId: price?.id || current.stripePriceId || null,
    subscriptionStatus: nextStatus,
    subscriptionPlanName: planName,
    plan: planName || current.plan || '',
    subscriptionAmount: amountFromPrice,
    subscriptionCurrency: price?.currency || current.subscriptionCurrency || null,
    subscriptionInterval: interval,
    subscriptionCurrentPeriodStart: unixToIso(subscriptionWithPeriods.current_period_start),
    subscriptionCurrentPeriodEnd: unixToIso(subscriptionWithPeriods.current_period_end),
    subscriptionCancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    subscriptionCanceledAt: unixToIso(subscription.canceled_at),
    subscriptionActivatedAt:
      nextStatus === 'active' ? current.subscriptionActivatedAt || unixToIso(subscription.start_date) || now : current.subscriptionActivatedAt || null,
    subscriptionUpdatedAt: now,
  };
}

async function syncSubscriptionToCustomer(
  customer: BillingCustomerRecord,
  subscription: Stripe.Subscription,
  options: SubscriptionSyncOptions = {},
) {
  const patch = buildSubscriptionCustomerPatch(customer, subscription, options);
  await adminDb.collection('users').doc(customer.id!).set(patch, { merge: true });
  return patch;
}

async function maybeScheduleInitialPickup(customer: BillingCustomerRecord) {
  const snapshot = await adminDb.collection('pickups').where('userId', '==', customer.id).get();
  const hasFutureScheduledPickup = snapshot.docs.some((doc) => {
    const data = doc.data();
    if (data.status !== 'scheduled' || typeof data.date !== 'string') {
      return false;
    }
    return new Date(data.date).getTime() >= Date.now();
  });

  if (hasFutureScheduledPickup) {
    return null;
  }

  const nextPickupDate = new Date();
  nextPickupDate.setDate(nextPickupDate.getDate() + 3);
  const pickupRef = adminDb.collection('pickups').doc();
  await pickupRef.set({
    tenantId: customer.tenantId || DEFAULT_TENANT_ID,
    userId: customer.id,
    date: nextPickupDate.toISOString(),
    status: 'scheduled',
    binLocation: 'Curbside',
    createdAt: nowIso(),
    sourceLabel: 'CWA Platform',
  });
  return pickupRef.id;
}

async function recordSubscriptionInvoicePayment(
  customer: BillingCustomerRecord,
  invoice: StripeInvoiceWithLines | null | undefined,
  fallbackPlan?: SubscriptionPlan | null,
) {
  if (!invoice?.id) {
    return null;
  }

  const amount = typeof invoice.amount_paid === 'number' ? invoice.amount_paid / 100 : 0;
  const paidAt = unixToIso(invoice.status_transitions?.paid_at) || unixToIso(invoice.created) || nowIso();
  const docId = paymentDocIdForInvoice(invoice.id);
  const line = invoice.lines?.data?.[0];
  const planName = fallbackPlan?.name || customer.subscriptionPlanName || customer.plan || null;

  await adminDb.collection('payments').doc(docId).set(
    {
      tenantId: customer.tenantId || DEFAULT_TENANT_ID,
      userId: customer.id,
      amount,
      status: invoice.paid ? 'paid' : invoice.status || 'pending',
      date: paidAt,
      paidAt,
      description: line?.description || subscriptionDescription(planName),
      recordType: 'invoice',
      sourceLabel: 'Stripe',
      stripeInvoiceId: invoice.id,
      stripeCustomerId: readStripeId(invoice.customer),
      stripeSubscriptionId: readStripeId(invoice.subscription),
      stripePriceId: line?.price?.id || null,
      stripePaymentIntentId: readStripeId(invoice.payment_intent),
      subscriptionPlanName: planName,
      subscriptionInterval: line?.price?.recurring?.interval || null,
      currency: invoice.currency || null,
    },
    { merge: true },
  );

  return docId;
}

async function retrieveSubscription(stripe: Stripe, subscriptionId: string) {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice', 'items.data.price'],
  });
}

async function finalizeSubscriptionSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  requestedCustomerId?: string | null,
) {
  if (session.mode !== 'subscription') {
    throw new Error('Checkout session is not a subscription session');
  }

  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    throw new Error('Subscription checkout has not been paid yet');
  }

  const metadataCustomerId = session.metadata?.customerId || null;
  const customerId = requestedCustomerId || metadataCustomerId;
  if (requestedCustomerId && metadataCustomerId && requestedCustomerId !== metadataCustomerId) {
    throw new Error('Subscription session does not belong to the signed-in customer');
  }

  const customer = await findCustomerForStripeObjects({
    customerId,
    stripeCustomerId: readStripeId(session.customer),
  });
  if (!customer?.id) {
    throw new Error('Unable to resolve the customer for this subscription session');
  }

  const subscriptionId = readStripeId(session.subscription);
  if (!subscriptionId) {
    throw new Error('Subscription checkout did not produce a Stripe subscription');
  }

  const plan = getSubscriptionPlan(session.metadata?.planId);
  const subscription = await retrieveSubscription(stripe, subscriptionId);
  const patch = await syncSubscriptionToCustomer(customer, subscription, {
    checkoutSessionId: session.id,
    plan,
  });

  await maybeScheduleInitialPickup(customer);
  const latestInvoice = subscription.latest_invoice && typeof subscription.latest_invoice !== 'string'
    ? (subscription.latest_invoice as StripeInvoiceWithLines)
    : null;
  await recordSubscriptionInvoicePayment(customer, latestInvoice, plan);

  return patch;
}

async function finalizeBalancePaymentSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  requestedCustomerId?: string | null,
) {
  if (session.mode !== 'payment') {
    throw new Error('Checkout session is not a one-time payment session');
  }

  if (session.payment_status !== 'paid') {
    throw new Error('Checkout session has not been paid yet');
  }

  const paymentId = session.metadata?.paymentId;
  const customerId = session.metadata?.customerId;
  if (!paymentId || !customerId) {
    throw new Error('Checkout session is missing payment metadata');
  }
  if (requestedCustomerId && requestedCustomerId !== customerId) {
    throw new Error('Payment session does not belong to the signed-in customer');
  }

  const tenantId = session.metadata?.tenantId || DEFAULT_TENANT_ID;
  return settleBalancePaymentForCustomer(paymentId, customerId, tenantId, {
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: readStripeId(session.customer),
    stripePaymentIntentId: readStripeId(session.payment_intent),
    sourceLabel: 'Stripe',
  });
}

export async function createSubscriptionCheckoutSession(params: {
  stripe: Stripe;
  customerId: string;
  planId: string;
  appUrl: string;
}) {
  const { stripe, customerId, planId, appUrl } = params;
  const plan = getSubscriptionPlan(planId);
  if (!plan) {
    throw new Error('Unknown subscription plan');
  }

  const customer = await getCustomerRecord(customerId);
  const stripeCustomerId = await ensureStripeCustomer(stripe, customer);
  const successUrl = `${appUrl}/subscribe?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl}/subscribe?subscription_cancelled=true`;

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: plan.name,
            description: plan.description,
          },
          unit_amount: Math.round(plan.amount * 100),
          recurring: {
            interval: plan.interval,
          },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: customerId,
    metadata: {
      customerId,
      tenantId: customer.tenantId || DEFAULT_TENANT_ID,
      planId: plan.id,
      planName: plan.name,
    },
    subscription_data: {
      metadata: {
        customerId,
        tenantId: customer.tenantId || DEFAULT_TENANT_ID,
        planId: plan.id,
        planName: plan.name,
      },
    },
  });

  await adminDb.collection('users').doc(customerId).set(
    {
      billingProvider: 'stripe',
      stripeCustomerId,
      stripeCheckoutSessionId: session.id,
      subscriptionPlanName: plan.name,
      subscriptionUpdatedAt: nowIso(),
    },
    { merge: true },
  );

  return { sessionId: session.id, url: session.url, plan };
}

export async function confirmSubscriptionCheckoutSession(params: {
  stripe: Stripe;
  customerId: string;
  sessionId: string;
}) {
  const session = await params.stripe.checkout.sessions.retrieve(params.sessionId, {
    expand: ['customer'],
  });
  return finalizeSubscriptionSession(params.stripe, session, params.customerId);
}

export async function createBalancePaymentCheckoutSession(params: {
  stripe: Stripe;
  customerId: string;
  amount: number;
  appUrl: string;
}) {
  const { stripe, customerId, amount, appUrl } = params;
  if (!(amount > 0)) {
    throw new Error('No outstanding balance is available for payment');
  }

  const customer = await getCustomerRecord(customerId);
  const stripeCustomerId = await ensureStripeCustomer(stripe, customer);
  const paymentRef = adminDb.collection('payments').doc();
  const paymentTimestamp = nowIso();

  await paymentRef.set({
    tenantId: customer.tenantId || DEFAULT_TENANT_ID,
    userId: customerId,
    amount,
    status: 'pending',
    date: paymentTimestamp,
    description: 'Balance Payment Receipt',
    recordType: 'receipt',
    sourceLabel: 'Stripe',
    stripeCustomerId,
  });

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'CWA Balance Payment',
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/dashboard/payments?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/dashboard/payments?payment_cancelled=true`,
    client_reference_id: customerId,
    metadata: {
      customerId,
      paymentId: paymentRef.id,
      tenantId: customer.tenantId || DEFAULT_TENANT_ID,
    },
  });

  await paymentRef.set(
    {
      stripeCheckoutSessionId: session.id,
    },
    { merge: true },
  );

  return { sessionId: session.id, paymentId: paymentRef.id, url: session.url };
}

export async function confirmBalancePaymentCheckoutSession(params: {
  stripe: Stripe;
  customerId: string;
  sessionId: string;
}) {
  const session = await params.stripe.checkout.sessions.retrieve(params.sessionId, {
    expand: ['customer'],
  });
  return finalizeBalancePaymentSession(params.stripe, session, params.customerId);
}

export async function handleStripeWebhook(params: {
  stripe: Stripe;
  payload: Buffer;
  signature: string;
  webhookSecret: string;
}) {
  const event = params.stripe.webhooks.constructEvent(params.payload, params.signature, params.webhookSecret);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription') {
        await finalizeSubscriptionSession(params.stripe, session);
      } else if (session.mode === 'payment') {
        await finalizeBalancePaymentSession(params.stripe, session);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customer = await findCustomerForStripeObjects({
        customerId: subscription.metadata?.customerId || null,
        stripeCustomerId: readStripeId(subscription.customer),
        stripeSubscriptionId: subscription.id,
      });
      if (customer) {
        await syncSubscriptionToCustomer(customer, subscription, {
          plan: getSubscriptionPlan(subscription.metadata?.planId),
        });
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as StripeInvoiceWithLines;
      const customer = await findCustomerForStripeObjects({
        stripeCustomerId: readStripeId(invoice.customer),
        stripeSubscriptionId: readStripeId(invoice.subscription),
      });
      if (customer) {
        await recordSubscriptionInvoicePayment(customer, invoice);
      }
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as StripeInvoiceWithLines;
      const subscriptionId = readStripeId(invoice.subscription);
      if (subscriptionId) {
        const subscription = await retrieveSubscription(params.stripe, subscriptionId);
        const customer = await findCustomerForStripeObjects({
          customerId: subscription.metadata?.customerId || null,
          stripeCustomerId: readStripeId(subscription.customer),
          stripeSubscriptionId: subscription.id,
        });
        if (customer) {
          await syncSubscriptionToCustomer(customer, subscription, {
            plan: getSubscriptionPlan(subscription.metadata?.planId),
          });
        }
      }
      break;
    }
    default:
      break;
  }

  return event;
}

export { buildSubscriptionCustomerPatch, toLocalSubscriptionStatus };
