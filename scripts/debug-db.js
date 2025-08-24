#!/usr/bin/env node

import { supabase } from '../src/lib/supabase.js';

async function debugDatabase() {
  console.log('🔍 Database Debug Script');
  console.log('📅 Timestamp:', new Date().toISOString());
  console.log('🔧 Environment Variables:');
  console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }

  try {
    console.log('\n🔌 Testing database connection...');
    
    // Test basic connection
    const { data, error } = await supabase
      .from('categories')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection failed:', error);
      return;
    }
    
    console.log('✅ Database connection successful!');
    
    // Check all tables
    const tables = ['categories', 'menu_items', 'store_config', 'menu_options', 'menu_option_choices'];
    
    for (const table of tables) {
      console.log(`\n📋 Checking table: ${table}`);
      try {
        const { data: tableData, error: tableError } = await supabase
          .from(table)
          .select('*')
          .limit(3);
        
        if (tableError) {
          console.error(`❌ Error querying ${table}:`, tableError);
        } else {
          console.log(`✅ ${table} table exists, count: ${tableData.length}`);
          if (tableData.length > 0) {
            console.log(`📊 Sample data:`, tableData[0]);
          }
        }
      } catch (err) {
        console.error(`❌ Exception querying ${table}:`, err);
      }
    }
    
    console.log('\n🎉 Debug completed!');
    
  } catch (error) {
    console.error('💥 Debug failed:', error);
  }
}

debugDatabase();
