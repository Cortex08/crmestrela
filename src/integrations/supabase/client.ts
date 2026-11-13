import { createClient } from '@supabase/supabase-js';

// Chaves públicas (anon). A segurança dos dados é garantida pelas regras de acesso (RLS) no banco.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xwcuaicofmufcdzhtkqr.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Y3VhaWNvZm11ZmNkemh0a3FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODE5NjMsImV4cCI6MjEwODg1Nzk2M30.Ifda4dl6GYDu8aib8DxAA1mWtMFfpfwaCv86fTM7TZc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
