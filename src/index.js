import Fastify from 'fastify';
import cors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './lib/supabase.js';
import { emailService } from './lib/email.js';
import { quoteDelivery } from './services/delivery.js';
import { hashPassword, comparePassword, generateToken, isValidEmail, isValidPassword } from './lib/auth.js';
import { authenticateUser, optionalAuth } from './middleware/auth.js';

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

        // Get conditional options for this item
        const { data: conditionalOptions, error: conditionalError } = await supabase
          .from('menu_conditional_options')
          .select(`
            parent_option_id,
            parent_choice_id,
            dependent_option_id
          `)
          .in('parent_option_id', options.map(opt => opt.id));

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
            })),
          // Add conditional logic info
          isConditional: conditionalOptions ? conditionalOptions.some(cond => cond.dependent_option_id === option.id) : false,
          dependsOnOption: conditionalOptions ? conditionalOptions.find(cond => cond.dependent_option_id === option.id)?.parent_option_id : null,
          dependsOnChoice: conditionalOptions ? conditionalOptions.find(cond => cond.dependent_option_id === option.id)?.parent_choice_id : null
        }));

        // Add conditional options data to the response
        const conditionalMap = {};
        if (conditionalOptions) {
          conditionalOptions.forEach(cond => {
            if (!conditionalMap[cond.parent_option_id]) {
              conditionalMap[cond.parent_option_id] = {};
            }
            conditionalMap[cond.parent_option_id][cond.parent_choice_id] = cond.dependent_option_id;
          });
        }

        return {
          id: item.id,
          name: item.name,
          description: item.description || '',
          price: item.price_pence,
          categoryId: item.category_id,
          imageUrl: item.image_url,
          options: transformedOptions,
          conditionalOptions: conditionalMap
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

// Checkout endpoint supporting three methods: guest, login, register
app.post('/api/checkout', async (req, reply) => {
  try {
    const {
      checkoutMethod, // 'guest', 'login', 'register'
      mode = 'collection',
      cartItems,
      subtotalPence = 0,
      deliveryFeePence = 0,
      discountPence = 0,
      totalPence = 0,
      paymentMethod = 'card',
      comment = '',
      // Guest checkout data
      guestData,
      // Login data
      loginData,
      // Registration data
      registerData
    } = req.body || {};

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      reply.code(400).send({ error: 'Cart is empty' });
      return;
    }

    let user = null;
    let contact = {};
    let address = {};

    // Handle different checkout methods
    switch (checkoutMethod) {
      case 'guest':
        // Validate guest data
        if (!guestData || !guestData.firstName || !guestData.email || !guestData.telephone) {
          reply.code(400).send({ error: 'Missing required guest information' });
          return;
        }
        if (mode === 'delivery' && (!guestData.postcode || !guestData.address)) {
          reply.code(400).send({ error: 'Delivery address required for delivery mode' });
          return;
        }
        
        contact = {
          firstName: guestData.firstName,
          lastName: guestData.lastName,
          name: `${guestData.firstName} ${guestData.lastName || ''}`.trim(),
          email: guestData.email,
          phone: guestData.telephone
        };
        address = {
          postcode: guestData.postcode,
          line1: guestData.address,
          streetName: guestData.streetName,
          city: guestData.city
        };
        break;

      case 'login':
        // Validate login data
        if (!loginData || !loginData.email || !loginData.password) {
          reply.code(400).send({ error: 'Email and password required' });
          return;
        }

        // Authenticate user
        const { data: loginUser, error: loginError } = await supabase
          .from('users')
          .select('*')
          .eq('email', loginData.email)
          .single();

        if (loginError || !loginUser) {
          reply.code(401).send({ error: 'Invalid email or password' });
          return;
        }

        const isValid = await comparePassword(loginData.password, loginUser.password_hash);
        if (!isValid) {
          reply.code(401).send({ error: 'Invalid email or password' });
          return;
        }

        user = loginUser;
        contact = {
          firstName: user.first_name,
          lastName: user.last_name,
          name: `${user.first_name} ${user.last_name || ''}`.trim(),
          email: user.email,
          phone: user.telephone
        };
        address = {
          postcode: user.postcode,
          line1: user.address,
          streetName: user.street_name,
          city: user.city
        };
        break;

      case 'register':
        // Validate registration data
        if (!registerData || !registerData.firstName || !registerData.email || 
            !registerData.telephone || !registerData.password || !registerData.passwordConfirm) {
          reply.code(400).send({ error: 'Missing required registration information' });
          return;
        }
        if (mode === 'delivery' && (!registerData.postcode || !registerData.address)) {
          reply.code(400).send({ error: 'Delivery address required for delivery mode' });
          return;
        }
        if (!isValidEmail(registerData.email)) {
          reply.code(400).send({ error: 'Invalid email format' });
          return;
        }
        if (!isValidPassword(registerData.password)) {
          reply.code(400).send({ error: 'Password must be at least 6 characters' });
          return;
        }
        if (registerData.password !== registerData.passwordConfirm) {
          reply.code(400).send({ error: 'Passwords do not match' });
          return;
        }

        // Check if email already exists
        const { data: existingUser, error: checkError } = await supabase
          .from('users')
          .select('id')
          .eq('email', registerData.email)
          .single();

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }

        if (existingUser) {
          reply.code(400).send({ error: 'Email already registered' });
          return;
        }

        // Create new user
        const passwordHash = await hashPassword(registerData.password);
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            email: registerData.email,
            password_hash: passwordHash,
            first_name: registerData.firstName,
            last_name: registerData.lastName,
            telephone: registerData.telephone,
            postcode: registerData.postcode,
            address: registerData.address,
            street_name: registerData.streetName,
            city: registerData.city
          })
          .select('id, email, first_name, last_name, telephone, postcode, address, street_name, city')
          .single();

        if (createError) throw createError;

        user = newUser;
        contact = {
          firstName: user.first_name,
          lastName: user.last_name,
          name: `${user.first_name} ${user.last_name || ''}`.trim(),
          email: user.email,
          phone: user.telephone
        };
        address = {
          postcode: user.postcode,
          line1: user.address,
          streetName: user.street_name,
          city: user.city
        };
        break;

      default:
        reply.code(400).send({ error: 'Invalid checkout method' });
        return;
    }

    // Generate order ID
    const orderId = 'ORD' + Math.random().toString(36).slice(2, 10).toUpperCase();
    
    // Insert order into database
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        user_id: user?.id,
        store_name: 'China Palace',
        first_name: contact.firstName || contact.name.split(' ')[0],
        last_name: contact.lastName || contact.name.split(' ').slice(1).join(' '),
        contact_email: contact.email,
        contact_phone: contact.phone,
        postcode: address.postcode,
        address: address.line1,
        street: address.streetName,
        city: address.city,
        mode,
        subtotal_pence: subtotalPence,
        delivery_fee_pence: deliveryFeePence,
        discount_pence: discountPence,
        total_pence: totalPence,
        payment_method: paymentMethod,
        status: 'processing',
        comment: comment
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

    // Send confirmation email
    if (contact.email) {
      try {
        await emailService.sendOrderConfirmation({
          contact,
          orderId,
          totalPence,
          cartItems,
          mode,
          subtotalPence,
          deliveryFeePence,
          discountPence,
          comment
        });
      } catch (emailError) {
        app.log.error('Email send error:', emailError);
        // Don't fail the order if email fails
      }
    }

    // Generate token for registered/logged in users
    let token = null;
    if (user) {
      token = generateToken(user.id);
    }

    return { 
      success: true, 
      orderId, 
      message: 'Order placed successfully', 
      paymentMethod,
      emailSent: !!contact.email,
      user: user ? {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        telephone: user.telephone,
        postcode: user.postcode,
        address: user.address,
        streetName: user.street_name,
        city: user.city
      } : null,
      token
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
      collectionBufferBeforeCloseMinutes,
      deliveryLeadTimeMinutes, 
      deliveryBufferBeforeCloseMinutes,
      storeId = 'default' 
    } = req.body;
    
    const updateData = {};
    
    if (collectionLeadTimeMinutes !== undefined) {
      updateData.collection_lead_time_minutes = collectionLeadTimeMinutes;
    }
    if (collectionBufferBeforeCloseMinutes !== undefined) {
      updateData.collection_buffer_before_close_minutes = collectionBufferBeforeCloseMinutes;
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

// Get store opening hours endpoint
app.get('/api/store/hours', async (req, reply) => {
  try {
    const { date } = req.query;
    // Use UK timezone for store operations
    const now = new Date();
    const ukTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/London"}));
    const targetDate = date ? new Date(date + 'T00:00:00') : ukTime;
    const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    app.log.info(`Fetching opening hours for day ${dayOfWeek} (${targetDate.toISOString().split('T')[0]})`);
    
    const { data, error } = await supabase
      .from('store_opening_hours')
      .select('*')
      .eq('day_of_week', dayOfWeek);
      
    if (error) {
      app.log.error('Supabase error fetching opening hours:', error);
      throw error;
    }
    
    app.log.info(`Found ${data.length} opening hours records for day ${dayOfWeek}:`, data);
    
    // Filter out closed periods and format the hours
    const openHours = data.filter(period => !period.is_closed);
    const todayHours = openHours.map(period => ({
      open_time: period.open_time,
      close_time: period.close_time,
      formatted: `${period.open_time.substring(0,5)}-${period.close_time.substring(0,5)}`
    }));
    
    const result = {
      day_of_week: dayOfWeek,
      date: targetDate.toISOString().split('T')[0],
      isOpen: todayHours.length > 0,
      is_closed: todayHours.length === 0,
      hours: todayHours
    };
    
    app.log.info('Returning opening hours result:', result);
    return result;
  } catch (error) {
    app.log.error('Error fetching opening hours:', error);
    // Return a fallback response instead of throwing
    return {
      day_of_week: new Date().getDay(),
      date: new Date().toISOString().split('T')[0],
      isOpen: false,
      is_closed: true,
      hours: [],
      error: 'Failed to fetch opening hours'
    };
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

// User registration endpoint
app.post('/api/auth/register', async (req, reply) => {
  try {
    const {
      firstName,
      lastName,
      email,
      telephone,
      password,
      passwordConfirm,
      postcode,
      address,
      streetName,
      city
    } = req.body;

    // Validation
    if (!firstName || !email || !telephone || !password || !passwordConfirm) {
      reply.code(400).send({ error: 'Missing required fields' });
      return;
    }

    if (!isValidEmail(email)) {
      reply.code(400).send({ error: 'Invalid email format' });
      return;
    }

    if (!isValidPassword(password)) {
      reply.code(400).send({ error: 'Password must be at least 6 characters' });
      return;
    }

    if (password !== passwordConfirm) {
      reply.code(400).send({ error: 'Passwords do not match' });
      return;
    }

    // Check if email already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existingUser) {
      reply.code(400).send({ error: 'Email already registered' });
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const { data: user, error: createError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        telephone,
        postcode,
        address,
        street_name: streetName,
        city
      })
      .select('id, email, first_name, last_name, telephone, postcode, address, street_name, city')
      .single();

    if (createError) throw createError;

    // Generate token
    const token = generateToken(user.id);

    return {
      success: true,
      user,
      token,
      message: 'Registration successful'
    };
  } catch (error) {
    app.log.error('Registration error:', error);
    reply.code(500).send({ error: 'Registration failed' });
  }
});

// User login endpoint
app.post('/api/auth/login', async (req, reply) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      reply.code(400).send({ error: 'Email and password required' });
      return;
    }

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (userError || !user) {
      reply.code(401).send({ error: 'Invalid email or password' });
      return;
    }

    // Check password
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      reply.code(401).send({ error: 'Invalid email or password' });
      return;
    }

    // Generate token
    const token = generateToken(user.id);

    // Remove password from response
    const { password_hash, ...userWithoutPassword } = user;

    return {
      success: true,
      user: userWithoutPassword,
      token,
      message: 'Login successful'
    };
  } catch (error) {
    app.log.error('Login error:', error);
    reply.code(500).send({ error: 'Login failed' });
  }
});

// Get current user endpoint
app.get('/api/auth/me', async (req, reply) => {
  try {
    const user = await authenticateUser(req, reply);
    if (!user) return;

    return {
      success: true,
      user
    };
  } catch (error) {
    app.log.error('Get user error:', error);
    reply.code(500).send({ error: 'Failed to get user' });
  }
});

// Check if store is open endpoint
app.get('/api/store/is-open', async (req, reply) => {
  try {
    // Use UK timezone for store operations
    const now = new Date();
    const ukTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/London"}));
    const dayOfWeek = ukTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentTime = ukTime.toTimeString().slice(0, 5); // HH:MM format
    const currentDate = ukTime.toISOString().split('T')[0];

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
    // Use UK timezone for store operations
    const now = new Date();
    const ukTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/London"}));
    const targetDate = date || ukTime.toISOString().split('T')[0];
    
    // Get store config for lead time and buffer
    const { data: storeConfig, error: configError } = await supabase
      .from('store_config')
      .select('collection_lead_time_minutes, collection_buffer_before_close_minutes')
      .eq('id', 'default')
      .single();

    if (configError) throw configError;

    const leadTimeMinutes = storeConfig.collection_lead_time_minutes || 15;
    const bufferMinutes = storeConfig.collection_buffer_before_close_minutes || 15;
    
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
    const isToday = targetDate === ukTime.toISOString().split('T')[0];
    const currentTime = ukTime.toTimeString().slice(0, 5);

    hours.forEach(slot => {
      if (slot.is_closed) return;

      let startTime = slot.open_time;
      let endTime = slot.close_time;

      // If it's today, adjust start time based on lead time
      if (isToday) {
        const leadTimeDate = new Date(ukTime);
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

    // Use UK timezone for store operations
    const now = new Date();
    const ukTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/London"}));
    const targetDate = date || ukTime.toISOString().split('T')[0];
    
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
    const isToday = targetDate === ukTime.toISOString().split('T')[0];
    const currentTime = ukTime.toTimeString().slice(0, 5);

    hours.forEach(slot => {
      if (slot.is_closed) return;

      let startTime = slot.open_time;
      let endTime = slot.close_time;

      // If it's today, adjust start time based on lead time
      if (isToday) {
        const leadTimeDate = new Date(ukTime);
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

// Get order details endpoint
app.get('/api/orders/:orderId', async (req, reply) => {
  try {
    const { orderId } = req.params;
    
    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      reply.code(404).send({ error: 'Order not found' });
      return;
    }

    // Get order items
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at');

    if (itemsError) throw itemsError;

    // Format order data
    const formattedOrder = {
      orderId: order.id,
      storeName: order.store_name,
      firstName: order.first_name,
      lastName: order.last_name,
      email: order.contact_email,
      telephone: order.contact_phone,
      postcode: order.postcode,
      address: order.address,
      street: order.street,
      city: order.city,
      paymentMethod: order.payment_method,
      deliveryOrCollection: order.mode,
      items: items.map(item => ({
        itemName: item.item_name,
        quantity: item.quantity,
        unitPrice: item.unit_price_pence / 100,
        itemTotal: item.total_price_pence / 100,
        modifiers: item.modifiers
      })),
      subtotal: order.subtotal_pence / 100,
      deliveryFee: order.delivery_fee_pence / 100,
      discount: order.discount_pence / 100,
      total: order.total_pence / 100,
      orderStatus: order.status,
      comment: order.comment,
      timePlaced: order.time_placed,
      createdAt: order.created_at
    };

    return formattedOrder;
  } catch (error) {
    app.log.error('Error fetching order details:', error);
    reply.code(500).send({ error: 'Failed to fetch order details' });
  }
});

// Update order status endpoint
app.patch('/api/orders/:orderId/status', async (req, reply) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status || !['processing', 'pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'complete'].includes(status)) {
      reply.code(400).send({ error: 'Invalid status' });
      return;
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, order: data };
  } catch (error) {
    app.log.error('Error updating order status:', error);
    reply.code(500).send({ error: 'Failed to update order status' });
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
  const railwayUrl = process.env.RAILWAY_STATIC_URL || `http://localhost:${port}`;
  console.log(`API running on ${railwayUrl}`);
  console.log(`Server listening at http://0.0.0.0:${port}`);
}).catch(err => {
  app.log.error(err);
  process.exit(1);
});