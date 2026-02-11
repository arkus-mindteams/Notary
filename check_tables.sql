-- Query to check which tables exist in your database
-- Run this in Supabase SQL Editor to see what's there

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
