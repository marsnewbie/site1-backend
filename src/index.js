import Fastify from 'fastify';
import cors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './lib/supabase.js';
import { emailService } from './lib/email.js';
import { quoteDelivery } from './services/delivery.js';

// Create Fastify instance
const app = Fastify({ logger: true });

// Enable CORS for all origins (for local dev)
await app.register(cors, { origin: '*' });

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple in-memory cart store (dev only)
const carts = {};

// Health check
app.get('/health', async () => ({ ok: true }));

// GET /api/menu returns categories and items
app.get('/api/menu', async () => {
  try {
    // Get categories
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('id, name')
      .order('display_order');

    if (catError) throw catError;

    // Get menu items
    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select('id, name, description, price_pence, category_id, image_url')
      .eq('is_available', true)
      .order('display_order');

    if (itemsError) throw itemsError;

    // Transform data for client
    const transformedItems = items.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description || '',
      price: item.price_pence,
      categoryId: item.category_id,
      imageUrl: item.image_url
    }));

    return { categories, items: transformedItems };
  } catch (error) {
    app.log.error('Menu fetch error:', error);
    return { categories: [], items: [] };
  }
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
  
  try {
    // Get item from database
    const { data: item, error } = await supabase
      .from('menu_items')
      .select('id, name, price_pence')
      .eq('id', itemId)
      .eq('is_available', true)
      .single();

    if (error || !item) {
      reply.code(400).send({ error: 'Invalid item' });
      return;
    }

    // Compute price delta from modifiers
    const modSum = modifiers.reduce((sum, m) => sum + (m.priceDeltaPence || 0), 0);
    const unitPrice = item.price_pence + modSum;
    cart.items.push({ itemId, qty, unitPrice, modifiers });
    cart.subtotalPence += unitPrice * qty;
    return cart;
  } catch (error) {
    app.log.error('Error adding item to cart:', error);
    reply.code(500).send({ error: 'Failed to add item to cart' });
  }
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

  try {
    // Generate order ID
    const orderId = 'ORD' + Math.random().toString(36).slice(2, 10).toUpperCase();
    
    // Insert order into database
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        contact_name: contact.name,
        contact_phone: contact.phone,
        contact_email: contact.email,
        mode,
        postcode: address?.postcode,
        address_line: address?.line1,
        subtotal_pence: subtotalPence,
        delivery_fee_pence: deliveryFeePence,
        total_pence: totalPence,
        payment_method: paymentMethod,
        status: 'pending'
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Insert order items
    const orderItems = cartItems.map(item => ({
      order_id: orderId,
      item_id: item.id,
      item_name: item.name,
      quantity: item.qty,
      unit_price_pence: item.price,
      total_price_pence: item.price * item.qty,
      modifiers: item.modifiers || []
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Send confirmation email if email is provided
    if (contact.email) {
      try {
        await emailService.sendOrderConfirmation({
          contact,
          orderId,
          totalPence,
          cartItems,
          mode
        });
      } catch (emailError) {
        app.log.error('Email send error:', emailError);
        // Don't fail the order if email fails
      }
    }

    return { 
      ok: true, 
      orderId, 
      message: 'Order placed successfully', 
      paymentMethod,
      emailSent: !!contact.email
    };
  } catch (error) {
    app.log.error('Checkout error:', error);
    reply.code(500).send({ error: 'Failed to place order' });
  }
});

// Switch delivery rule type endpoint
app.post('/api/delivery/switch-rule-type', async (req, reply) => {
  try {
    const { ruleType, storeId = 'default' } = req.body;
    
    if (!ruleType || !['postcode', 'distance'].includes(ruleType)) {
      reply.code(400).send({ error: 'Invalid rule type. Must be "postcode" or "distance"' });
      return;
    }

    const { data, error } = await supabase
      .from('store_config')
      .update({ delivery_active_rule_type: ruleType })
      .eq('id', storeId)
      .select()
      .single();

    if (error) throw error;

    return { 
      success: true, 
      activeRuleType: ruleType,
      message: `Delivery rule type switched to ${ruleType}`
    };
  } catch (error) {
    app.log.error('Error switching delivery rule type:', error);
    reply.code(500).send({ error: 'Failed to switch delivery rule type' });
  }
});

// Get store configuration endpoint
app.get('/api/store/config', async (req, reply) => {
  try {
    const { storeId = 'default' } = req.query;
    
    const { data, error } = await supabase
      .from('store_config')
      .select('*')
      .eq('id', storeId)
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    app.log.error('Error fetching store config:', error);
    reply.code(500).send({ error: 'Failed to fetch store configuration' });
  }
});

// Image upload endpoint
app.post('/api/upload/image', async (req, reply) => {
  try {
    const { itemId, imageData, fileName } = req.body;
    
    if (!itemId || !imageData || !fileName) {
      reply.code(400).send({ error: 'Missing required fields' });
      return;
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(imageData.split(',')[1], 'base64');
    
    // Generate unique filename
    const timestamp = Date.now();
    const hash = Math.random().toString(36).substring(2, 15);
    const extension = fileName.split('.').pop();
    const path = `menu/${itemId}/main-${hash}.${extension}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('media')
      .upload(path, buffer, {
        contentType: `image/${extension}`,
        upsert: false
      });

    if (error) throw error;

    // Generate public URL
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/media/${path}`;

    // Update menu item with image URL
    const { error: updateError } = await supabase
      .from('menu_items')
      .update({ image_url: publicUrl })
      .eq('id', itemId);

    if (updateError) throw updateError;

    return { 
      success: true, 
      url: publicUrl,
      path: path
    };
  } catch (error) {
    app.log.error('Image upload error:', error);
    reply.code(500).send({ error: 'Failed to upload image' });
  }
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