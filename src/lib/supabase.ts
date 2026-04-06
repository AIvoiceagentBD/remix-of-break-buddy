import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = 'https://pudipynmfuoumqrrehcu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1ZGlweW5tZnVvdW1xcnJlaGN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MDkwNTQsImV4cCI6MjA5MDI4NTA1NH0.3tHgPyoWtl5oeSApKHDu-pTM2rSPJShpAkdr9GPXeFM';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
