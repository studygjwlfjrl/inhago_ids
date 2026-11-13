-- Run once in Supabase SQL Editor. Existing profile rows and scores are preserved.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_department_length CHECK (department IS NULL OR char_length(department) <= 60);
-- Existing profiles RLS SELECT/UPDATE policies must allow users to read relevant profiles and edit their own row.
