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

// GET /api/menu returns categories and items with options
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

    // Get options for each item
    const itemsWithOptions = await Promise.all(
      items.map(async (item) => {
        // Get options
        const { data: options, error: optionsError } = await supabase
          .from('menu_options')
          .select(`
            id,
            name,
            type,
            required,
            display_order,
            menu_option_choices (
              id,
              name,
              price_delta_pence,
              display_order
            )
          `)
          .eq('item_id', item.id)
          .order('display_order');

        if (optionsError) {
          app.log.error(`Error fetching options for item ${item.id}:`, optionsError);
          return {
            id: item.id,
            name: item.name,
            description: item.description || '',
            price: item.price_pence,
            categoryId: item.category_id,
            imageUrl: item.image_url,
            options: []
          };
        }

        // Transform options
        const transformedOptions = options.map(option => ({
          id: option.id,
          name: option.name,
          type: option.type,
          required: option.required,
          choices: option.menu_option_choices
            .sort((a, b) => a.display_order - b.display_order)
            .map(choice => ({
              id: choice.id,
              name: choice.name,
              priceDelta: choice.price_delta_pence
            }))
        }));

        return {
          id: item.id,
          name: item.name,
          description: item.description || '',
          price: item.price_pence,
          categoryId: item.category_id,
          imageUrl: item.image_url,
          options: transformedOptions
        };
      })
    );

    return { categories, items: itemsWithOptions };
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

// Update store time settings endpoint
app.post('/api/store/update-time-settings', async (req, reply) => {
  try {
    const { 
      collectionLeadTimeMinutes, 
      deliveryLeadTimeMinutes, 
      deliveryBufferBeforeCloseMinutes,
      storeId = 'default' 
    } = req.body;
    
    const updateData = {};
    
    if (collectionLeadTimeMinutes !== undefined) {
      updateData.collection_lead_time_minutes = collectionLeadTimeMinutes;
    }
    if (deliveryLeadTimeMinutes !== undefined) {
      updateData.delivery_lead_time_minutes = deliveryLeadTimeMinutes;
    }
    if (deliveryBufferBeforeCloseMinutes !== undefined) {
      updateData.delivery_buffer_before_close_minutes = deliveryBufferBeforeCloseMinutes;
    }

    if (Object.keys(updateData).length === 0) {
      reply.code(400).send({ error: 'No valid time settings provided' });
      return;
    }

    const { data, error } = await supabase
      .from('store_config')
      .update(updateData)
      .eq('id', storeId)
      .select()
      .single();

    if (error) throw error;

    return { 
      success: true, 
      updatedSettings: updateData,
      message: 'Time settings updated successfully'
    };
  } catch (error) {
    app.log.error('Error updating time settings:', error);
    reply.code(500).send({ error: 'Failed to update time settings' });
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

// Get discount rules endpoint
app.get('/api/discounts', async (req, reply) => {
  try {
    const { data, error } = await supabase
      .from('discount_rules')
      .select('*')
      .eq('is_active', true)
      .order('min_amount_pence');

    if (error) throw error;

    return data;
  } catch (error) {
    app.log.error('Error fetching discount rules:', error);
    reply.code(500).send({ error: 'Failed to fetch discount rules' });
  }
});

// Get opening hours endpoint
app.get('/api/store/hours', async (req, reply) => {
  try {
    const { data, error } = await supabase
      .from('store_opening_hours')
      .select('*')
      .order('day_of_week, open_time');

    if (error) throw error;

    return data;
  } catch (error) {
    app.log.error('Error fetching opening hours:', error);
    reply.code(500).send({ error: 'Failed to fetch opening hours' });
  }
});

// Get holidays endpoint
app.get('/api/store/holidays', async (req, reply) => {
  try {
    const { data, error } = await supabase
      .from('store_holidays')
      .select('*')
      .gte('holiday_date', new Date().toISOString().split('T')[0])
      .order('holiday_date');

    if (error) throw error;

    return data;
  } catch (error) {
    app.log.error('Error fetching holidays:', error);
    reply.code(500).send({ error: 'Failed to fetch holidays' });
  }
});

// Check if store is open endpoint
app.get('/api/store/is-open', async (req, reply) => {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const currentDate = now.toISOString().split('T')[0];

    // Check if today is a holiday
    const { data: holidays, error: holidayError } = await supabase
      .from('store_holidays')
      .select('*')
      .eq('holiday_date', currentDate);

    if (holidayError) throw holidayError;

    if (holidays && holidays.length > 0) {
      const holiday = holidays[0];
      const isInHolidayTime = currentTime >= holiday.start_time && currentTime <= holiday.end_time;
      return { 
        isOpen: !isInHolidayTime, 
        reason: isInHolidayTime ? 'Holiday' : 'Open during holiday period'
      };
    }

    // Check opening hours for today
    const { data: hours, error: hoursError } = await supabase
      .from('store_opening_hours')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .order('open_time');

    if (hoursError) throw hoursError;

    if (!hours || hours.length === 0) {
      return { isOpen: false, reason: 'No opening hours set' };
    }

    // Check if any time slot is currently open
    const isCurrentlyOpen = hours.some(slot => {
      if (slot.is_closed) return false;
      
      const openTime = slot.open_time;
      const closeTime = slot.close_time;
      
      // Handle overnight hours (e.g., 16:00-00:00)
      if (closeTime < openTime) {
        return currentTime >= openTime || currentTime <= closeTime;
      } else {
        return currentTime >= openTime && currentTime <= closeTime;
      }
    });

    return { 
      isOpen: isCurrentlyOpen, 
      reason: isCurrentlyOpen ? 'Open' : 'Outside opening hours',
      currentTime,
      dayOfWeek
    };
  } catch (error) {
    app.log.error('Error checking store status:', error);
    reply.code(500).send({ error: 'Failed to check store status' });
  }
});

// Get available collection times endpoint
app.get('/api/store/collection-times', async (req, reply) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // Get store config for lead time
    const { data: storeConfig, error: configError } = await supabase
      .from('store_config')
      .select('collection_lead_time_minutes')
      .eq('id', 'default')
      .single();

    if (configError) throw configError;

    const leadTimeMinutes = storeConfig.collection_lead_time_minutes || 15;
    
    // Get opening hours for the target date
    const targetDay = new Date(targetDate).getDay();
    const { data: hours, error: hoursError } = await supabase
      .from('store_opening_hours')
      .select('*')
      .eq('day_of_week', targetDay)
      .order('open_time');

    if (hoursError) throw hoursError;

    if (!hours || hours.length === 0) {
      return { availableTimes: [], reason: 'Closed on this day' };
    }

    // Check if it's a holiday
    const { data: holidays, error: holidayError } = await supabase
      .from('store_holidays')
      .select('*')
      .eq('holiday_date', targetDate);

    if (holidayError) throw holidayError;

    const availableTimes = [];
    const now = new Date();
    const isToday = targetDate === now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);

    hours.forEach(slot => {
      if (slot.is_closed) return;

      let startTime = slot.open_time;
      let endTime = slot.close_time;

      // If it's today, adjust start time based on lead time
      if (isToday) {
        const leadTimeDate = new Date();
        leadTimeDate.setMinutes(leadTimeDate.getMinutes() + leadTimeMinutes);
        const leadTimeStr = leadTimeDate.toTimeString().slice(0, 5);
        
        if (leadTimeStr > startTime) {
          startTime = leadTimeStr;
        }
      }

      // Generate 15-minute intervals
      let currentSlot = new Date(`2000-01-01T${startTime}:00`);
      const endSlot = new Date(`2000-01-01T${endTime}:00`);

      while (currentSlot < endSlot) {
        const timeStr = currentSlot.toTimeString().slice(0, 5);
        
        // Check if this time is within holiday period
        const isHolidayTime = holidays && holidays.some(holiday => 
          timeStr >= holiday.start_time && timeStr <= holiday.end_time
        );

        if (!isHolidayTime) {
          availableTimes.push(timeStr);
        }

        currentSlot.setMinutes(currentSlot.getMinutes() + 15);
      }
    });

    return { availableTimes };
  } catch (error) {
    app.log.error('Error getting collection times:', error);
    reply.code(500).send({ error: 'Failed to get collection times' });
  }
});

// Get available delivery times endpoint
app.get('/api/store/delivery-times', async (req, reply) => {
  try {
    const { date, postcode } = req.query;
    
    if (!postcode) {
      reply.code(400).send({ error: 'Postcode is required for delivery times' });
      return;
    }

    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // Get store config for delivery settings
    const { data: storeConfig, error: configError } = await supabase
      .from('store_config')
      .select('delivery_lead_time_minutes, delivery_buffer_before_close_minutes')
      .eq('id', 'default')
      .single();

    if (configError) throw configError;

    const leadTimeMinutes = storeConfig.delivery_lead_time_minutes || 45;
    const bufferMinutes = storeConfig.delivery_buffer_before_close_minutes || 15;
    
    // Get opening hours for the target date
    const targetDay = new Date(targetDate).getDay();
    const { data: hours, error: hoursError } = await supabase
      .from('store_opening_hours')
      .select('*')
      .eq('day_of_week', targetDay)
      .order('open_time');

    if (hoursError) throw hoursError;

    if (!hours || hours.length === 0) {
      return { availableTimes: [], reason: 'Closed on this day' };
    }

    // Check if it's a holiday
    const { data: holidays, error: holidayError } = await supabase
      .from('store_holidays')
      .select('*')
      .eq('holiday_date', targetDate);

    if (holidayError) throw holidayError;

    const availableTimes = [];
    const now = new Date();
    const isToday = targetDate === now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);

    hours.forEach(slot => {
      if (slot.is_closed) return;

      let startTime = slot.open_time;
      let endTime = slot.close_time;

      // If it's today, adjust start time based on lead time
      if (isToday) {
        const leadTimeDate = new Date();
        leadTimeDate.setMinutes(leadTimeDate.getMinutes() + leadTimeMinutes);
        const leadTimeStr = leadTimeDate.toTimeString().slice(0, 5);
        
        if (leadTimeStr > startTime) {
          startTime = leadTimeStr;
        }
      }

      // Adjust end time based on buffer
      const endTimeDate = new Date(`2000-01-01T${endTime}:00`);
      endTimeDate.setMinutes(endTimeDate.getMinutes() - bufferMinutes);
      const adjustedEndTime = endTimeDate.toTimeString().slice(0, 5);

      // Generate 15-minute intervals
      let currentSlot = new Date(`2000-01-01T${startTime}:00`);
      const endSlot = new Date(`2000-01-01T${adjustedEndTime}:00`);

      while (currentSlot < endSlot) {
        const timeStr = currentSlot.toTimeString().slice(0, 5);
        
        // Check if this time is within holiday period
        const isHolidayTime = holidays && holidays.some(holiday => 
          timeStr >= holiday.start_time && timeStr <= holiday.end_time
        );

        if (!isHolidayTime) {
          availableTimes.push(timeStr);
        }

        currentSlot.setMinutes(currentSlot.getMinutes() + 15);
      }
    });

    return { availableTimes };
  } catch (error) {
    app.log.error('Error getting delivery times:', error);
    reply.code(500).send({ error: 'Failed to get delivery times' });
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