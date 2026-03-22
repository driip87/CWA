import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { adminAuth } from './src/server/firebaseAdmin';
import {
  confirmBalancePaymentCheckoutSession,
  confirmSubscriptionCheckoutSession,
  createBalancePaymentCheckoutSession,
  createSubscriptionCheckoutSession,
  handleStripeWebhook,
} from './src/server/billing';
import { appendQueryParams } from './src/shared/url';
import { DEFAULT_TENANT_ID } from './src/shared/unified';
import {
  backfillCustomerStatuses,
  bootstrapAuthSession,
  getClaimPreview,
  importLegacyCustomers,
  resendInviteForCustomer,
  resolveCustomerConflict,
  revokeInvite,
} from './src/server/phase1';
import { backfillExpenseTenantIds } from './src/server/expenses';
import { settleBalancePaymentForCustomer } from './src/server/payments';
import {
  createConnection,
  getAdminAnalytics,
  getAdminCustomers,
  getAdminOverview,
  getAdminPickups,
  getAdminRoutes,
  getUserDashboard,
  getUserPayments,
  getUserPickups,
  listConnections,
  listConnectorCatalog,
  listSyncJobs,
  runConnectionSync,
} from './src/server/unified/service';
import { startIntegrationScheduler } from './src/server/unified/scheduler';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    stripeClient = new Stripe(key, { apiVersion: '2026-02-25.clover' });
  }
  return stripeClient;
}

async function verifyRequest(req: express.Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new Error('Missing authorization token');
  }
  const idToken = header.slice('Bearer '.length);
  return adminAuth.verifyIdToken(idToken);
}

async function verifyAdminRequest(req: express.Request) {
  const decodedToken = await verifyRequest(req);
  const session = await bootstrapAuthSession(decodedToken);
  if (session.account.role !== 'admin') {
    throw new Error('Admin access required');
  }
  return { decodedToken, session };
}

async function verifySessionRequest(req: express.Request) {
  const decodedToken = await verifyRequest(req);
  const session = await bootstrapAuthSession(decodedToken);
  return { decodedToken, session };
}

function resolveTenantId(session: Awaited<ReturnType<typeof bootstrapAuthSession>>) {
  return session.customer?.tenantId || session.account?.tenantId || DEFAULT_TENANT_ID;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers['stripe-signature'];

    if (!webhookSecret) {
      res.status(503).json({ error: 'STRIPE_WEBHOOK_SECRET environment variable is required' });
      return;
    }

    if (typeof signature !== 'string') {
      res.status(400).json({ error: 'Missing Stripe webhook signature' });
      return;
    }

    try {
      const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      await handleStripeWebhook({
        stripe: getStripe(),
        payload,
        signature,
        webhookSecret,
      });
      res.json({ received: true });
    } catch (error: any) {
      console.error('Stripe webhook error:', error);
      res.status(400).json({ error: error.message || 'Failed to process Stripe webhook' });
    }
  });

  app.use(express.json({ limit: '2mb' }));
  startIntegrationScheduler();

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/bootstrap', async (req, res) => {
    try {
      const decodedToken = await verifyRequest(req);
      const result = await bootstrapAuthSession(
        decodedToken,
        req.body?.claimToken || null,
        req.body?.profileName || null,
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to bootstrap session' });
    }
  });

  app.get('/api/claim/:token', async (req, res) => {
    try {
      const preview = await getClaimPreview(req.params.token);
      if (!preview) {
        res.status(404).json({ error: 'Claim invite not found' });
        return;
      }
      res.json(preview);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load claim invite' });
    }
  });

  app.post('/api/admin/import-customers', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const result = await importLegacyCustomers(req.body?.csvText || '', decodedToken.uid);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to import customers' });
    }
  });

  app.post('/api/admin/customers/:customerId/resend-invite', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const invite = await resendInviteForCustomer(req.params.customerId, decodedToken.uid);
      res.json(invite);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to resend invite' });
    }
  });

  app.post('/api/admin/customers/:customerId/revoke-invite', async (req, res) => {
    try {
      await verifyAdminRequest(req);
      await revokeInvite(req.params.customerId);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to revoke invite' });
    }
  });

  app.post('/api/admin/customers/:customerId/resolve', async (req, res) => {
    try {
      await verifyAdminRequest(req);
      const customer = await resolveCustomerConflict(
        req.params.customerId,
        req.body?.mode === 'link_existing' ? 'link_existing' : 'standalone',
        req.body?.targetCustomerId,
      );
      res.json({ customer });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to resolve customer record' });
    }
  });

  app.post('/api/admin/migrations/phase1', async (req, res) => {
    try {
      await verifyAdminRequest(req);
      await backfillCustomerStatuses();
      res.json({ ok: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to run migration' });
    }
  });

  app.post('/api/admin/migrations/expense-tenants', async (req, res) => {
    try {
      await verifyAdminRequest(req);
      const result = await backfillExpenseTenantIds();
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to run expense tenant migration' });
    }
  });

  app.get('/api/admin/integrations/catalog', async (req, res) => {
    try {
      await verifyAdminRequest(req);
      res.json({ vendors: listConnectorCatalog() });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load integration catalog' });
    }
  });

  app.get('/api/admin/integrations/connections', async (req, res) => {
    try {
      const { session } = await verifyAdminRequest(req);
      const tenantId = resolveTenantId(session);
      const [connections, syncJobs] = await Promise.all([listConnections(tenantId), listSyncJobs(tenantId)]);
      res.json({ connections, syncJobs: syncJobs.slice(0, 10) });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load integration connections' });
    }
  });

  app.post('/api/admin/integrations/connections', async (req, res) => {
    try {
      const { session } = await verifyAdminRequest(req);
      const tenantId = resolveTenantId(session);
      const connection = await createConnection(tenantId, {
        name: req.body?.name,
        vendor: req.body?.vendor,
        syncScheduleMinutes: Number(req.body?.syncScheduleMinutes) || undefined,
        adapterMode: req.body?.adapterMode,
        settings: req.body?.settings,
      });
      res.json({ connection });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to save integration connection' });
    }
  });

  app.post('/api/admin/integrations/connections/:connectionId/sync', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const job = await runConnectionSync(req.params.connectionId, decodedToken.uid, 'manual');
      res.json({ job });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to run sync' });
    }
  });

  app.get('/api/admin/domain/overview', async (req, res) => {
    try {
      const { session } = await verifyAdminRequest(req);
      const tenantId = resolveTenantId(session);
      res.json(await getAdminOverview(tenantId));
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load overview' });
    }
  });

  app.get('/api/admin/domain/customers', async (req, res) => {
    try {
      const { session } = await verifyAdminRequest(req);
      const tenantId = resolveTenantId(session);
      res.json({ customers: await getAdminCustomers(tenantId) });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load customers' });
    }
  });

  app.get('/api/admin/domain/routes', async (req, res) => {
    try {
      const { session } = await verifyAdminRequest(req);
      const tenantId = resolveTenantId(session);
      res.json({ routes: await getAdminRoutes(tenantId) });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load routes' });
    }
  });

  app.get('/api/admin/domain/pickups', async (req, res) => {
    try {
      const { session } = await verifyAdminRequest(req);
      const tenantId = resolveTenantId(session);
      res.json(await getAdminPickups(tenantId));
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load service monitoring' });
    }
  });

  app.get('/api/admin/domain/analytics', async (req, res) => {
    try {
      const { session } = await verifyAdminRequest(req);
      const tenantId = resolveTenantId(session);
      res.json(await getAdminAnalytics(tenantId));
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load analytics' });
    }
  });

  app.get('/api/user/domain/dashboard', async (req, res) => {
    try {
      const { session } = await verifySessionRequest(req);
      const tenantId = resolveTenantId(session);
      if (!session.customer?.id) {
        throw new Error('Customer profile is required');
      }
      res.json(await getUserDashboard(tenantId, session.customer.id));
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load dashboard' });
    }
  });

  app.get('/api/user/domain/pickups', async (req, res) => {
    try {
      const { session } = await verifySessionRequest(req);
      const tenantId = resolveTenantId(session);
      if (!session.customer?.id) {
        throw new Error('Customer profile is required');
      }
      res.json({ pickups: await getUserPickups(tenantId, session.customer.id) });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load pickups' });
    }
  });

  app.get('/api/user/domain/payments', async (req, res) => {
    try {
      const { session } = await verifySessionRequest(req);
      const tenantId = resolveTenantId(session);
      if (!session.customer?.id) {
        throw new Error('Customer profile is required');
      }
      res.json(await getUserPayments(tenantId, session.customer.id));
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load payments' });
    }
  });

  app.post('/api/user/payments/:paymentId/settle', async (req, res) => {
    try {
      const { session } = await verifySessionRequest(req);
      const tenantId = resolveTenantId(session);
      if (!session.customer?.id) {
        throw new Error('Customer profile is required');
      }
      const result = await settleBalancePaymentForCustomer(req.params.paymentId, session.customer.id, tenantId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to settle balance payment' });
    }
  });

  app.post('/api/create-checkout-session', async (req, res) => {
    try {
      const { session } = await verifySessionRequest(req);
      const tenantId = resolveTenantId(session);
      if (!session.customer?.id) {
        throw new Error('Customer profile is required');
      }

      const { outstandingBalance } = await getUserPayments(tenantId, session.customer.id);
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const checkout = await createBalancePaymentCheckoutSession({
        stripe: getStripe(),
        customerId: session.customer.id,
        amount: outstandingBalance,
        appUrl,
      });

      res.json({ url: checkout.url, paymentId: checkout.paymentId, sessionId: checkout.sessionId });
    } catch (error: any) {
      console.error('Stripe error:', error);
      res.status(500).json({ error: error.message || 'Failed to create checkout session' });
    }
  });

  app.post('/api/create-subscription-session', async (req, res) => {
    try {
      const { session } = await verifySessionRequest(req);
      if (!session.customer?.id) {
        throw new Error('Customer profile is required');
      }

      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const checkout = await createSubscriptionCheckoutSession({
        stripe: getStripe(),
        customerId: session.customer.id,
        planId: String(req.body?.planId || ''),
        appUrl,
      });

      res.json({ url: checkout.url, sessionId: checkout.sessionId, plan: checkout.plan });
    } catch (error: any) {
      console.error('Stripe error:', error);
      res.status(500).json({ error: error.message || 'Failed to create subscription session' });
    }
  });

  app.post('/api/user/payments/confirm', async (req, res) => {
    try {
      const { session } = await verifySessionRequest(req);
      if (!session.customer?.id) {
        throw new Error('Customer profile is required');
      }
      const sessionId = String(req.body?.sessionId || '');
      if (!sessionId) {
        throw new Error('Checkout session id is required');
      }

      res.json(
        await confirmBalancePaymentCheckoutSession({
          stripe: getStripe(),
          customerId: session.customer.id,
          sessionId,
        }),
      );
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to confirm payment checkout' });
    }
  });

  app.post('/api/user/subscription/confirm', async (req, res) => {
    try {
      const { session } = await verifySessionRequest(req);
      if (!session.customer?.id) {
        throw new Error('Customer profile is required');
      }
      const sessionId = String(req.body?.sessionId || '');
      if (!sessionId) {
        throw new Error('Checkout session id is required');
      }

      res.json(
        await confirmSubscriptionCheckoutSession({
          stripe: getStripe(),
          customerId: session.customer.id,
          sessionId,
        }),
      );
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to confirm subscription checkout' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
