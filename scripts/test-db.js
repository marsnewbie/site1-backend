#!/usr/bin/env node

import { supabase } from '../src/lib/supabase.js';

async function testDatabase() {
  try {
    console.log('Testing database connection...');
    
    // Test basic connection
    const { data, error } = await supabase
      .from('categories')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('Database connection error:', error);
      return;
    }
    
    console.log('Database connection successful!');
    
    // Check if tables exist
    console.log('Checking tables...');
    
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('*')
      .limit(5);
    
    if (catError) {
      console.error('Categories table error:', catError);
    } else {
      console.log('Categories table exists, count:', categories.length);
    }
    
    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select('*')
      .limit(5);
    
    if (itemsError) {
      console.error('Menu items table error:', itemsError);
    } else {
      console.log('Menu items table exists, count:', items.length);
    }
    
    const { data: config, error: configError } = await supabase
      .from('store_config')
      .select('*')
      .limit(5);
    
    if (configError) {
      console.error('Store config table error:', configError);
    } else {
      console.log('Store config table exists, count:', config.length);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testDatabase();
