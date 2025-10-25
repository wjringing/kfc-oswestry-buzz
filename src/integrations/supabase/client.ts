// TEMPORARY FIX: Hardcoded credentials due to env variable loading issue
// This should be reverted once Lovable Cloud env sync is working
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://shruuhcwsuixvqtuallk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNocnV1aGN3c3VpeHZxdHVhbGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMDc5NjUsImV4cCI6MjA3Njc4Mzk2NX0.X5Ji9N9hNIdPeb6wjdkzQQuB8lTb_MnCT3ozkY2Wwk8";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});