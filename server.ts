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
  importLegacyCustomers,
  resolveCustomerConflict,
  revokeInvite,
} from './src/server/phase1';

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
