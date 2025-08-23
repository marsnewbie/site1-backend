import Fastify from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs';
import path from 'path';
import { quoteDelivery } from './services/delivery.js';

// Create Fastify instance
const app = Fastify({ logger: true });

// Enable CORS for all origins (for local dev)
await app.register(cors, { origin: '*' });

// Load menu seed once
const menuPath = path.join(__dirname, '..', '..', 'seed', 'menu.sample.json');
const menuData = JSON.parse(fs.readFileSync(menuPath, 'utf-8'));

// Simple in-memory cart store (dev only)
const carts = {};

// Health check
app.get('/health', async () => ({ ok: true }));

// GET /api/menu returns categories and items
app.get('/api/menu', async () => {
  // Flatten items and attach categoryId for client consumption
  const categories = menuData.categories.map(({ id, name }) => ({ id, name }));
  const items = [];
  menuData.categories.forEach((cat) => {
    (cat.items || []).forEach((item) => {
      items.push({
        id: item.id,
        name: item.name,
        description: item.description || '',
        price: item.pricePence,
        categoryId: cat.id,
      });
    });
  });
  return { categories, items };
});

// Create a new cart
app.post('/api/cart/create', async (req, reply) => {
  const id = Math.random().toString(36).slice(2);
  carts[id] = { id, items: [], subtotalPence: 0 };
  return carts[id];
});

// Add item to cart
app.post('/api/cart/:id/add', async (req, reply) => {
  const { id } = req.params;
  const cart = carts[id];
  if (!cart) {
    reply.code(404).send({ error: 'Cart not found' });
    return;
  }
  const { itemId, qty = 1, modifiers = [] } = req.body || {};
  const item = menuData.categories.flatMap(cat => cat.items).find(it => it.id === itemId);
  if (!item) {
    reply.code(400).send({ error: 'Invalid item' });
    return;
  }
  // Compute price delta from modifiers
  const modSum = modifiers.reduce((sum, m) => sum + (m.priceDeltaPence || 0), 0);
  const unitPrice = item.pricePence + modSum;
  cart.items.push({ itemId, qty, unitPrice, modifiers });
  cart.subtotalPence += unitPrice * qty;
  return cart;
});

// Delivery quote endpoint
app.post('/api/delivery/quote', async (req, reply) => {
  const { mode = 'delivery', postcode = '', address = '', subtotalPence = 0 } = req.body || {};
  try {
    const quote = await quoteDelivery({ mode, postcode, address, subtotalPence, store: 'default' });
    return quote;
  } catch (e) {
    reply.code(400).send({ error: e.message });
  }
});

// Checkout endpoint (guest or logged in) — returns simple success without processing payment.
app.post('/api/checkout', async (req, reply) => {
  const {
    mode = 'collection',
    contact,
    address,
    cartItems,
    subtotalPence = 0,
    deliveryFeePence = 0,
    totalPence = 0,
    paymentMethod = 'card',
  } = req.body || {};
  if (!contact || !contact.name || !contact.phone) {
    reply.code(400).send({ error: 'Missing contact information' });
    return;
  }
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    reply.code(400).send({ error: 'Cart is empty' });
    return;
  }
  // In a real implementation, persist order, handle payment, trigger printer, etc.
  const orderId = 'ORD' + Math.random().toString(36).slice(2, 10).toUpperCase();
  return { ok: true, orderId, message: 'Order placed successfully', paymentMethod };
});

// TODO: checkout endpoints, printing ACK, etc. For brevity we stub them.

// Start server
const port = Number(process.env.PORT || 3001);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`API running on http://localhost:${port}`);
}).catch(err => {
  app.log.error(err);
  process.exit(1);
});