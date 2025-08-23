#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkIfEmpty() {
  try {
    // Check if categories table is empty
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('id')
      .limit(1);

    if (catError) throw catError;

    // Check if menu_items table is empty
    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select('id')
      .limit(1);

    if (itemsError) throw itemsError;

    // Check if delivery_zones table is empty
    const { data: zones, error: zonesError } = await supabase
      .from('delivery_zones')
      .select('id')
      .limit(1);

    if (zonesError) throw zonesError;

    return {
      categories: categories.length === 0,
      items: items.length === 0,
      zones: zones.length === 0
    };
  } catch (error) {
    console.error('Error checking database:', error);
    return { categories: true, items: true, zones: true };
  }
}

async function seedData() {
  try {
    console.log('Checking if database is empty...');
    const isEmpty = await checkIfEmpty();
    
    if (!isEmpty.categories && !isEmpty.items && !isEmpty.zones) {
      console.log('Database is not empty, skipping seed data.');
      return;
    }

    console.log('Database is empty, seeding data...');

    // Load seed data
    const menuPath = path.join(__dirname, '..', 'seed', 'menu.sample.json');
    const menuData = JSON.parse(fs.readFileSync(menuPath, 'utf-8'));

    const postcodePath = path.join(__dirname, '..', 'seed', 'delivery.postcode_zone.sample.json');
    const postcodeData = JSON.parse(fs.readFileSync(postcodePath, 'utf-8'));

    // Insert categories
    if (isEmpty.categories) {
      console.log('Inserting categories...');
      const categories = menuData.categories.map(({ id, name }) => ({ id, name }));
      const { error: catError } = await supabase
        .from('categories')
        .insert(categories);
      
      if (catError) throw catError;
      console.log('Categories inserted successfully.');
    }

    // Insert menu items
    if (isEmpty.items) {
      console.log('Inserting menu items...');
      const items = [];
      menuData.categories.forEach((cat) => {
        (cat.items || []).forEach((item) => {
          items.push({
            id: item.id,
            category_id: cat.id,
            name: item.name,
            description: item.description || '',
            price_pence: item.pricePence,
            display_order: 1
          });
        });
      });

      const { error: itemsError } = await supabase
        .from('menu_items')
        .insert(items);
      
      if (itemsError) throw itemsError;
      console.log('Menu items inserted successfully.');
    }

    // Insert delivery zones
    if (isEmpty.zones) {
      console.log('Inserting delivery zones...');
      const zones = postcodeData.postcode_prefix.areas.map(zone => ({
        pattern: zone.pattern,
        fee_gbp: zone.fee_gbp,
        min_order_gbp: postcodeData.postcode_prefix.default_min_order_gbp || 0
      }));

      const { error: zonesError } = await supabase
        .from('delivery_zones')
        .insert(zones);
      
      if (zonesError) throw zonesError;
      console.log('Delivery zones inserted successfully.');
    }

    console.log('Seed data inserted successfully!');
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

// Check if --if-empty flag is provided
const ifEmptyOnly = process.argv.includes('--if-empty');

if (ifEmptyOnly) {
  seedData();
} else {
  console.log('Use --if-empty flag to only seed if database is empty');
  process.exit(1);
}
