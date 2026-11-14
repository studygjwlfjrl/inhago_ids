-- Run in Supabase SQL Editor; existing profile data remains unchanged.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department text;
-- Department is optional; validate its length in the application (maxlength=60).
-- Existing RLS policies must permit users to update their own profile
-- and read the department of users visible in the friends list.
