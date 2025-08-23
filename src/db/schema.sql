-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Store configuration table
CREATE TABLE IF NOT EXISTS store_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL,
  currency TEXT DEFAULT '£',
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  address TEXT,
  postcode TEXT,
  delivery_active_rule_type TEXT DEFAULT 'postcode' CHECK (delivery_active_rule_type IN ('postcode', 'distance')),
  delivery_postcode_rules JSONB,
  delivery_distance_rules JSONB,
  collection_lead_time_minutes INTEGER DEFAULT 15,
  collection_buffer_before_close_minutes INTEGER DEFAULT 15,
  delivery_lead_time_minutes INTEGER DEFAULT 45,
  delivery_buffer_before_close_minutes INTEGER DEFAULT 15,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_pence INTEGER NOT NULL,
  image_url TEXT,
  is_available BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Menu options table (for item customization)
CREATE TABLE IF NOT EXISTS menu_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id TEXT REFERENCES menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('radio', 'checkbox')),
  required BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Menu option choices table
CREATE TABLE IF NOT EXISTS menu_option_choices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  option_id UUID REFERENCES menu_options(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta_pence INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conditional options (for dependent options like Set Meal choices)
CREATE TABLE IF NOT EXISTS menu_conditional_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_option_id UUID REFERENCES menu_options(id) ON DELETE CASCADE,
  parent_choice_id UUID REFERENCES menu_option_choices(id) ON DELETE CASCADE,
  dependent_option_id UUID REFERENCES menu_options(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Discount rules table
CREATE TABLE IF NOT EXISTS discount_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed_amount', 'free_item')),
  min_amount_pence INTEGER NOT NULL,
  discount_value DECIMAL(10,2), -- percentage or fixed amount
  free_item_name TEXT, -- for free item discounts
  can_combine BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Store opening hours table
CREATE TABLE IF NOT EXISTS store_opening_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 1=Monday, etc.
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table for customer accounts
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  telephone TEXT NOT NULL,
  postcode TEXT,
  address TEXT,
  street_name TEXT,
  city TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Store holidays table
CREATE TABLE IF NOT EXISTS store_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  holiday_date DATE NOT NULL,
  start_time TIME DEFAULT '00:01',
  end_time TIME DEFAULT '23:59',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_email TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('collection', 'delivery')),
  postcode TEXT,
  address_line TEXT,
  subtotal_pence INTEGER NOT NULL,
  delivery_fee_pence INTEGER DEFAULT 0,
  total_pence INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),
  payment_method TEXT DEFAULT 'card',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_pence INTEGER NOT NULL,
  total_price_pence INTEGER NOT NULL,
  modifiers JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Delivery zones table
CREATE TABLE IF NOT EXISTS delivery_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern TEXT NOT NULL UNIQUE,
  fee_gbp DECIMAL(10,2) NOT NULL,
  min_order_gbp DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(is_available);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_pattern ON delivery_zones(pattern);
