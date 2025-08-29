#!/usr/bin/env node

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

    return {
      categories: categories.length === 0,
      items: items.length === 0
    };
  } catch (error) {
    console.error('Error checking database:', error);
    return { categories: true, items: true };
  }
}

async function seedData() {
  try {
    console.log('Checking if database is empty...');
    const isEmpty = await checkIfEmpty();
    
    if (!isEmpty.categories && !isEmpty.items) {
      console.log('Database is not empty, skipping seed data.');
      return;
    }

    console.log('Database is empty, seeding data...');

    // Insert categories
    if (isEmpty.categories) {
      console.log('Inserting categories...');
      const categories = [
        { id: 'cat_app', name: 'Appetisers', description: 'Start your meal with our delicious appetisers and starters', display_order: 1 },
        { id: 'cat_set', name: 'Set Meals', description: 'Complete meals perfect for sharing with family and friends', display_order: 2 },
        { id: 'cat_soup', name: 'Soup', description: '', display_order: 3 },
        { id: 'cat_new_dishes', name: 'New Dishes', description: '', display_order: 4 },
        { id: 'cat_extra_portions', name: 'Extra Portions', description: '', display_order: 5 },
        { id: 'cat_rice', name: 'Rice', description: '', display_order: 6 },
        { id: 'cat_curry', name: 'Curry Dishes', description: 'with Onions and Peas', display_order: 7 },
        { id: 'cat_chow_mein', name: 'Chow Mein Dishes (Long Tray)', description: 'Noodles with Onions & Beansprouts', display_order: 8 },
        { id: 'cat_chop_suey', name: 'Chop Suey Dishes', description: '(Beansprouts, Bamboo Shoots & Water Chestnuts, Mushrooms, Onions)', display_order: 9 },
        { id: 'cat_sweet_sour', name: 'Sweet & Sour Dishes', description: '', display_order: 10 },
        { id: 'cat_king_prawn', name: 'King Prawn Dishes', description: '', display_order: 11 },
        { id: 'cat_duck', name: 'Duck Dishes', description: '', display_order: 12 },
        { id: 'cat_chicken', name: 'Chicken Dishes', description: '', display_order: 13 },
        { id: 'cat_beef', name: 'Beef Dishes', description: '', display_order: 14 },
        { id: 'cat_roast_pork', name: 'Roast Pork Dishes', description: '', display_order: 15 },
        { id: 'cat_egg_foo_yung', name: 'Egg Foo Yung Dishes', description: '(Chinese Omelette with Mushrooms, Onions & Peas)', display_order: 16 },
        { id: 'cat_english', name: 'English Dishes', description: '(Grilled Steak, Omelette etc.)', display_order: 17 },
        { id: 'cat_special_dinners', name: 'Special Dinners', description: '', display_order: 18 },
        { id: 'cat_cantonese', name: 'Cantonese Cuisine', description: '', display_order: 19 },
        { id: 'cat_set_recommended', name: 'Recommended Set Dinners', description: '', display_order: 20 },
        { id: 'cat_set_chef', name: 'Chef\'s Special Set Dinners', description: '', display_order: 21 }
      ];
      const { error: catError } = await supabase
        .from('categories')
        .insert(categories);
      
      if (catError) throw catError;
      console.log('Categories inserted successfully.');
    }

    // Insert menu items
    if (isEmpty.items) {
      console.log('Inserting menu items...');
      const items = [
        {
          id: 'item_aromatic_duck',
          category_id: 'cat_app',
          name: 'Aromatic Duck',
          description: 'Crispy aromatic duck with pancakes, spring onion & cucumber.',
          price_pence: 900,
          display_order: 1,
          is_available: true
        },
        {
          id: 'item_set_meal_a',
          category_id: 'cat_set',
          name: 'Set Meal A (for 2 people)',
          description: 'Complete meal for two people',
          price_pence: 1000,
          display_order: 1,
          is_available: true
        },
        {
          id: 'item_set_meal_b',
          category_id: 'cat_set',
          name: 'Set Meal B (for 4 people)',
          description: 'Complete meal for four people',
          price_pence: 1800,
          display_order: 2,
          is_available: true
        }
      ];

      const { error: itemsError } = await supabase
        .from('menu_items')
        .insert(items);
      
      if (itemsError) throw itemsError;
      console.log('Menu items inserted successfully.');

      // Insert menu options for Aromatic Duck
      console.log('Inserting menu options...');
      
      // Option 1: Size (Radio, Required)
      const { data: sizeOption, error: sizeOptionError } = await supabase
        .from('menu_options')
        .insert({
          item_id: 'item_aromatic_duck',
          name: 'Size',
          type: 'radio',
          required: true,
          display_order: 1
        })
        .select()
        .single();
      
      if (sizeOptionError) throw sizeOptionError;

      // Size choices
      const { error: sizeChoicesError } = await supabase
        .from('menu_option_choices')
        .insert([
          {
            option_id: sizeOption.id,
            name: 'Large',
            price_delta_pence: 100,
            display_order: 1
          },
          {
            option_id: sizeOption.id,
            name: 'Small',
            price_delta_pence: 50,
            display_order: 2
          }
        ]);
      
      if (sizeChoicesError) throw sizeChoicesError;

      // Option 2: Sauce (Checkbox, Optional)
      const { data: sauceOption, error: sauceOptionError } = await supabase
        .from('menu_options')
        .insert({
          item_id: 'item_aromatic_duck',
          name: 'Sauce',
          type: 'checkbox',
          required: false,
          display_order: 2
        })
        .select()
        .single();
      
      if (sauceOptionError) throw sauceOptionError;

      // Sauce choices
      const { error: sauceChoicesError } = await supabase
        .from('menu_option_choices')
        .insert([
          {
            option_id: sauceOption.id,
            name: 'No Sauce',
            price_delta_pence: 0,
            display_order: 1
          },
          {
            option_id: sauceOption.id,
            name: 'Curry Sauce',
            price_delta_pence: 100,
            display_order: 2
          },
          {
            option_id: sauceOption.id,
            name: 'Satay Sauce',
            price_delta_pence: 100,
            display_order: 3
          }
        ]);
      
      if (sauceChoicesError) throw sauceChoicesError;

      // Set Meal A options
      // Option 1: Main Course (Radio, Required)
      const { data: mainCourseOption, error: mainCourseOptionError } = await supabase
        .from('menu_options')
        .insert({
          item_id: 'item_set_meal_a',
          name: 'Main Course',
          type: 'radio',
          required: true,
          display_order: 1
        })
        .select()
        .single();
      
      if (mainCourseOptionError) throw mainCourseOptionError;

      // Main course choices
      const { data: mainCourseChoices, error: mainCourseChoicesError } = await supabase
        .from('menu_option_choices')
        .insert([
          {
            option_id: mainCourseOption.id,
            name: 'Beef Curry',
            price_delta_pence: 0,
            display_order: 1
          },
          {
            option_id: mainCourseOption.id,
            name: 'Chicken Curry',
            price_delta_pence: 0,
            display_order: 2
          }
        ])
        .select();
      
      if (mainCourseChoicesError) throw mainCourseChoicesError;

      // Option 2: Side (Radio, Required) - Conditional on main course
      const { data: sideOption, error: sideOptionError } = await supabase
        .from('menu_options')
        .insert({
          item_id: 'item_set_meal_a',
          name: 'Side',
          type: 'radio',
          required: true,
          display_order: 2
        })
        .select()
        .single();
      
      if (sideOptionError) throw sideOptionError;

      // Side choices
      const { data: sideChoices, error: sideChoicesError } = await supabase
        .from('menu_option_choices')
        .insert([
          {
            option_id: sideOption.id,
            name: 'Rice',
            price_delta_pence: 0,
            display_order: 1
          },
          {
            option_id: sideOption.id,
            name: 'Noodle',
            price_delta_pence: 100,
            display_order: 2
          },
          {
            option_id: sideOption.id,
            name: 'Chips',
            price_delta_pence: 100,
            display_order: 3
          },
          {
            option_id: sideOption.id,
            name: 'Fried Rice',
            price_delta_pence: 100,
            display_order: 4
          }
        ])
        .select();
      
      if (sideChoicesError) throw sideChoicesError;

      // Set up conditional options
      // Beef Curry -> Rice/Noodle
      const beefCurry = mainCourseChoices.find(c => c.name === 'Beef Curry');
      const rice = sideChoices.find(c => c.name === 'Rice');
      const noodle = sideChoices.find(c => c.name === 'Noodle');
      
      const { error: beefConditionalError } = await supabase
        .from('menu_conditional_options')
        .insert([
          {
            parent_option_id: mainCourseOption.id,
            parent_choice_id: beefCurry.id,
            dependent_option_id: sideOption.id
          }
        ]);
      
      if (beefConditionalError) throw beefConditionalError;

      // Chicken Curry -> Chips/Fried Rice
      const chickenCurry = mainCourseChoices.find(c => c.name === 'Chicken Curry');
      const chips = sideChoices.find(c => c.name === 'Chips');
      const friedRice = sideChoices.find(c => c.name === 'Fried Rice');
      
      const { error: chickenConditionalError } = await supabase
        .from('menu_conditional_options')
        .insert([
          {
            parent_option_id: mainCourseOption.id,
            parent_choice_id: chickenCurry.id,
            dependent_option_id: sideOption.id
          }
        ]);
      
      if (chickenConditionalError) throw chickenConditionalError;

      // ===== SET MEAL B CONFIGURATION =====
      console.log('Creating Set Meal B options...');
      
      // Set Meal B - Step 1 Option (Burger selection - Radio, Required)
      const { data: mealBStep1Option, error: mealBStep1Error } = await supabase
        .from('menu_options')
        .insert({
          item_id: 'item_set_meal_b',
          name: 'Step 1 Option',
          type: 'radio',
          required: true,
          display_order: 1
        })
        .select()
        .single();
      
      if (mealBStep1Error) throw mealBStep1Error;

      // Step 1 choices
      const { data: mealBStep1Choices, error: mealBStep1ChoicesError } = await supabase
        .from('menu_option_choices')
        .insert([
          {
            option_id: mealBStep1Option.id,
            name: 'Fish Burger',
            price_delta_pence: 0,
            display_order: 1
          },
          {
            option_id: mealBStep1Option.id,
            name: 'Ham Burger',
            price_delta_pence: 100,
            display_order: 2
          }
        ])
        .select();
      
      if (mealBStep1ChoicesError) throw mealBStep1ChoicesError;

      // Step 2 Option (Fish path - Checkbox, Required)
      const { data: mealBStep2FishOption, error: mealBStep2FishError } = await supabase
        .from('menu_options')
        .insert({
          item_id: 'item_set_meal_b',
          name: 'Step 2 Option (Fish)',
          type: 'checkbox',
          required: true,
          display_order: 2
        })
        .select()
        .single();
      
      if (mealBStep2FishError) throw mealBStep2FishError;

      // Fish path choices
      const { error: mealBFishChoicesError } = await supabase
        .from('menu_option_choices')
        .insert([
          {
            option_id: mealBStep2FishOption.id,
            name: 'Boiled Rice',
            price_delta_pence: 0,
            display_order: 1
          },
          {
            option_id: mealBStep2FishOption.id,
            name: 'Fried Rice',
            price_delta_pence: 100,
            display_order: 2
          }
        ]);
      
      if (mealBFishChoicesError) throw mealBFishChoicesError;

      // Step 2 Option (Ham path - Checkbox, Required)
      const { data: mealBStep2HamOption, error: mealBStep2HamError } = await supabase
        .from('menu_options')
        .insert({
          item_id: 'item_set_meal_b',
          name: 'Step 2 Option (Ham)',
          type: 'checkbox',
          required: true,
          display_order: 3
        })
        .select()
        .single();
      
      if (mealBStep2HamError) throw mealBStep2HamError;

      // Ham path choices
      const { error: mealBHamChoicesError } = await supabase
        .from('menu_option_choices')
        .insert([
          {
            option_id: mealBStep2HamOption.id,
            name: 'Chips',
            price_delta_pence: 0,
            display_order: 1
          },
          {
            option_id: mealBStep2HamOption.id,
            name: 'Noodle',
            price_delta_pence: 150,
            display_order: 2
          }
        ]);
      
      if (mealBHamChoicesError) throw mealBHamChoicesError;

      // Set up conditional logic - Fish Burger → Fish options
      const fishBurger = mealBStep1Choices.find(c => c.name === 'Fish Burger');
      const hamBurger = mealBStep1Choices.find(c => c.name === 'Ham Burger');
      
      const { error: fishConditionalError } = await supabase
        .from('menu_conditional_options')
        .insert([
          {
            parent_option_id: mealBStep1Option.id,
            parent_choice_id: fishBurger.id,
            dependent_option_id: mealBStep2FishOption.id
          }
        ]);
      
      if (fishConditionalError) throw fishConditionalError;

      // Set up conditional logic - Ham Burger → Ham options
      const { error: hamConditionalError } = await supabase
        .from('menu_conditional_options')
        .insert([
          {
            parent_option_id: mealBStep1Option.id,
            parent_choice_id: hamBurger.id,
            dependent_option_id: mealBStep2HamOption.id
          }
        ]);
      
      if (hamConditionalError) throw hamConditionalError;

      console.log('Set Meal B options created successfully.');
      console.log('Menu options inserted successfully.');
    }

    // Insert store configuration (China Palace)
    console.log('Inserting store configuration...');
    const storeConfig = {
      id: 'default',
      name: 'China Palace',
      currency: '£',
      location_lat: 53.61085,
      location_lng: -1.35667,
      address: '12 Barnsley Road, Hemsworth, Pontefract, WF9 4PY',
      postcode: 'WF9 4PY',
      delivery_active_rule_type: 'postcode', // Can be switched to 'distance'
      delivery_postcode_rules: {
        normalize_uk_postcode: true,
        default_min_order_threshold: 10,
        default_extra_fee_if_below_threshold: 1,
        areas: [
          { pattern: "WF9 4", fee: 2.30 },
          { pattern: "WF9 3", fee: 2.60 },
          { pattern: "S72 9", fee: 2.60 },
          { pattern: "WF9 2", fee: 2.80 },
          { pattern: "WF9 5", fee: 2.80 },
          { pattern: "WF9 1", fee: 3.30 },
          { pattern: "WF7 7", fee: 3.30 },
          { pattern: "WF4 2", fee: 3.30 },
          { pattern: "S72 8", fee: 3.30 },
          { pattern: "S72 7", fee: 3.30 }
        ]
      },
      delivery_distance_rules: {
        unit: "mile",
        bands: [
          { max_distance: 1.0, fee_if_subtotal_gte: 0, fee_if_subtotal_lt: 1 },
          { max_distance: 2.0, fee_if_subtotal_gte: 1, fee_if_subtotal_lt: 2 },
          { max_distance: 3.0, fee_if_subtotal_gte: 2, fee_if_subtotal_lt: 3 }
        ],
        no_service_beyond: 3.0
      },
      collection_lead_time_minutes: 15,
      collection_buffer_before_close_minutes: 15,
      delivery_lead_time_minutes: 45,
      delivery_buffer_before_close_minutes: 15
    };

    const { error: storeError } = await supabase
      .from('store_config')
      .upsert(storeConfig, { onConflict: 'id' });
    
    if (storeError) throw storeError;
    console.log('Store configuration inserted successfully.');

    // Insert discount rules
    console.log('Inserting discount rules...');
    const discountRules = [
      {
        name: '10% off over £10',
        type: 'percentage',
        min_amount_pence: 1000,
        discount_value: 10.0,
        can_combine: false,
        is_active: true
      },
      {
        name: '15% off over £20',
        type: 'percentage',
        min_amount_pence: 2000,
        discount_value: 15.0,
        can_combine: false,
        is_active: true
      },
      {
        name: '£1 off over £10',
        type: 'fixed_amount',
        min_amount_pence: 1000,
        discount_value: 1.0,
        can_combine: true,
        is_active: true
      },
      {
        name: 'Free Prawn Crackers over £20',
        type: 'free_item',
        min_amount_pence: 2000,
        free_item_name: 'Prawn Crackers',
        can_combine: true,
        is_active: true
      }
    ];

    const { error: discountError } = await supabase
      .from('discount_rules')
      .insert(discountRules);
    
    if (discountError) throw discountError;
    console.log('Discount rules inserted successfully.');

    // Insert opening hours
    console.log('Inserting opening hours...');
    const openingHours = [
      { day_of_week: 1, open_time: '12:00', close_time: '15:00' }, // Monday lunch
      { day_of_week: 1, open_time: '17:00', close_time: '23:00' }, // Monday dinner
      { day_of_week: 2, is_closed: true }, // Tuesday closed
      { day_of_week: 3, open_time: '12:00', close_time: '15:00' }, // Wednesday lunch
      { day_of_week: 3, open_time: '17:00', close_time: '23:00' }, // Wednesday dinner
      { day_of_week: 4, open_time: '12:00', close_time: '15:00' }, // Thursday lunch
      { day_of_week: 4, open_time: '17:00', close_time: '23:00' }, // Thursday dinner
      { day_of_week: 5, open_time: '16:00', close_time: '00:00' }, // Friday
      { day_of_week: 6, open_time: '16:00', close_time: '00:00' }, // Saturday
      { day_of_week: 0, open_time: '16:00', close_time: '00:00' }  // Sunday
    ];

    const { error: hoursError } = await supabase
      .from('store_opening_hours')
      .insert(openingHours);
    
    if (hoursError) throw hoursError;
    console.log('Opening hours inserted successfully.');

    // Insert holidays with different time slots
    console.log('Inserting holidays...');
    const holidays = [
      {
        holiday_date: '2025-08-24',
        start_time: '00:01',
        end_time: '23:59'
      },
      {
        holiday_date: '2025-08-26',
        start_time: '08:00',
        end_time: '22:00'
      },
      {
        holiday_date: '2025-09-01',
        start_time: '00:01',
        end_time: '23:59'
      }
    ];

    const { error: holidaysError } = await supabase
      .from('store_holidays')
      .insert(holidays);
    
    if (holidaysError) throw holidaysError;
    console.log('Holidays inserted successfully.');

    // Note: delivery_zones table is legacy and no longer used
    // All delivery rules are now stored in store_config table

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
