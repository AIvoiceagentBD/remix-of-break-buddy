import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = 'https://mljufuqnbpeqkzilrqvh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sanVmdXFuYnBlcWt6aWxycXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MDc3MDIsImV4cCI6MjA5MDI4MzcwMn0.Tgfal-tqPD_m9NJHIksEE6icMHyZENpIZy1UA7eH6Ao';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Project ID for constructing edge function URLs
export const EXTERNAL_SUPABASE_PROJECT_ID = 'mljufuqnbpeqkzilrqvh';
