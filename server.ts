import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { adminAuth } from './src/server/firebaseAdmin';
import { appendQueryParams } from './src/shared/url';
import {
  backfillCustomerStatuses,
  bootstrapAuthSession,
  createInviteForCustomer,
  getClaimPreview,
  resolveCustomerConflict,
  revokeInvite,
} from './src/server/phase1';
import {
  confirmMigrationJob,
  createMigrationJob,
  exportMigrationAdapter,
  exportMigrationErrors,
  getMigrationDashboard,
  getMigrationJobDetails,
  listMigrationJobs,
  rerunMigrationJob,
  saveMigrationColumnMapping,
  validateMigrationJob,
} from './src/server/migration';

dotenv.config();

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/bootstrap', async (req, res) => {
    try {
      const decodedToken = await verifyRequest(req);
      const result = await bootstrapAuthSession(decodedToken, req.body?.claimToken || null);
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

  app.post('/api/admin/migration-jobs', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const result = await createMigrationJob({
        csvText: req.body?.csvText || '',
        fileName: req.body?.fileName,
        sourceSystem: req.body?.sourceSystem,
        adapterType: req.body?.adapterType,
        adminUid: decodedToken.uid,
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to create migration job' });
    }
  });

  app.post('/api/admin/migration-jobs/list', async (req, res) => {
    try {
      await verifyAdminRequest(req);
      const result = await listMigrationJobs();
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to list migration jobs' });
    }
  });

  app.post('/api/admin/migration-dashboard', async (req, res) => {
    try {
      await verifyAdminRequest(req);
      const result = await getMigrationDashboard();
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load migration dashboard' });
    }
  });

  app.post('/api/admin/migration-jobs/:jobId/details', async (req, res) => {
    try {
      await verifyAdminRequest(req);
      const result = await getMigrationJobDetails(req.params.jobId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to load migration job details' });
    }
  });

  app.post('/api/admin/migration-jobs/:jobId/mapping', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const result = await saveMigrationColumnMapping(req.params.jobId, {
        columnMapping: req.body?.columnMapping || {},
        autoSendInvites: req.body?.autoSendInvites,
        adminUid: decodedToken.uid,
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to save migration mapping' });
    }
  });

  app.post('/api/admin/migration-jobs/:jobId/validate', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const result = await validateMigrationJob(req.params.jobId, decodedToken.uid);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to validate migration job' });
    }
  });

  app.post('/api/admin/migration-jobs/:jobId/confirm', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const result = await confirmMigrationJob(req.params.jobId, {
        adminUid: decodedToken.uid,
        autoSendInvites: req.body?.autoSendInvites,
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to confirm migration job' });
    }
  });

  app.post('/api/admin/migration-jobs/:jobId/rerun', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const result = await rerunMigrationJob(req.params.jobId, decodedToken.uid);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to rerun migration job' });
    }
  });

  app.post('/api/admin/migration-jobs/:jobId/error-export', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const result = await exportMigrationErrors(req.params.jobId, decodedToken.uid);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to export migration errors' });
    }
  });

  app.post('/api/admin/migration-jobs/:jobId/adapter-export', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const result = await exportMigrationAdapter(req.params.jobId, decodedToken.uid);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to export migration adapter payload' });
    }
  });

  app.post('/api/admin/customers/:customerId/resend-invite', async (req, res) => {
    try {
      const { decodedToken } = await verifyAdminRequest(req);
      const invite = await createInviteForCustomer(req.params.customerId, decodedToken.uid);
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

  app.post('/api/create-checkout-session', async (req, res) => {
    try {
      const { amount, description, userId, paymentId, returnUrl } = req.body;
      const stripe = getStripe();
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const baseUrl = returnUrl || `${appUrl}/dashboard`;
      const successUrl = appendQueryParams(baseUrl, {
        payment_success: 'true',
        payment_id: paymentId || '',
      });
      const cancelUrl = appendQueryParams(baseUrl, {
        payment_cancelled: 'true',
      });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: description || 'Waste Management Service',
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          paymentId,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Stripe error:', error);
      res.status(500).json({ error: error.message || 'Failed to create checkout session' });
    }
  });

  app.post('/api/create-subscription-session', async (req, res) => {
    try {
      const { planName, amount, userId, returnUrl } = req.body;
      const stripe = getStripe();
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const baseUrl = returnUrl || `${appUrl}/dashboard`;
      const successUrl = appendQueryParams(baseUrl, {
        subscription_success: 'true',
        session_id: '{CHECKOUT_SESSION_ID}',
      });
      const cancelUrl = appendQueryParams(baseUrl, {
        subscription_cancelled: 'true',
      });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: planName || 'Monthly Waste Collection',
              },
              unit_amount: Math.round(amount * 100),
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Stripe error:', error);
      res.status(500).json({ error: error.message || 'Failed to create subscription session' });
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
