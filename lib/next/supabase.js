import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const key = (
  process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || ''
).trim();

let client;

export function getSupabase() {
  if (!url || !key) throw new Error('Supabase server credentials are not configured.');
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
