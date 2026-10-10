'use strict';
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

let supabase = null;

if (config.supabase && config.supabase.enabled) {
  try {
    supabase = createClient(config.supabase.url, config.supabase.key, {
      auth: { persistSession: false },
    });
    console.log('[supabase] Supabase client initialized successfully.');
  } catch (err) {
    console.error('[supabase] Failed to initialize Supabase client:', err.message);
  }
}

module.exports = { supabase };
