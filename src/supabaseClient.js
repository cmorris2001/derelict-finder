import { createClient } from '@supabase/supabase-js'

// 🔧 replace these with your real values
export const supabaseUrl = 'https://vubodsvwtgbkskiudqgu.supabase.co'
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1Ym9kc3Z3dGdia3NraXVkcWd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxNTk0NTYsImV4cCI6MjA3NzczNTQ1Nn0.A9sZ_mHfd5zjIO31hqlSkDmQxwnXxjTT34ti9a12GQA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)


