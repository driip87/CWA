import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import Stripe from 'stripe';
import dotenv from 'dotenv';

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/create-checkout-session', async (req, res) => {
    try {
      const { amount, description, userId, paymentId, returnUrl } = req.body;
      const stripe = getStripe();
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const baseUrl = returnUrl || `${appUrl}/dashboard`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: description || 'Waste Management Service',
              },
              unit_amount: Math.round(amount * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${baseUrl}?payment_success=true&payment_id=${paymentId}`,
        cancel_url: `${baseUrl}?payment_cancelled=true`,
        metadata: {
          userId,
          paymentId
        }
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

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: planName || 'Monthly Waste Collection',
              },
              unit_amount: Math.round(amount * 100), // Convert to cents
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${baseUrl}?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}?subscription_cancelled=true`,
        metadata: {
          userId
        }
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Stripe error:', error);
      res.status(500).json({ error: error.message || 'Failed to create subscription session' });
    }
  });

  // Vite middleware for development
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
