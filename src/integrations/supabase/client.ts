// src/integrations/supabase/client.ts
import { createClient } from '@supabase/supabase-js';

// Vite env vars must be prefixed with VITE_ and available at build time.
// Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Helpful runtime message in dev
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
