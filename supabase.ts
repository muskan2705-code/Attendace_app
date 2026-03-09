import { createClient } from '@supabase/supabase-js'

// These will be replaced by the user with their own Supabase credentials
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export type Employee = {
  id: string
  name: string
  designation: string
  joining_date: string
  monthly_salary: number
  created_at?: string
}

export type AttendanceRecord = {
  id?: number
  employee_id: string
  year: number
  month: number
  day: number
  status: 'P' | 'A' | 'L' | 'H'
}
