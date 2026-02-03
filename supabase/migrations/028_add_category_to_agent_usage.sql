-- Add category column to agent_usage_logs for granular tracking (e.g. 'preaviso', 'deslinde', 'admin')
alter table public.agent_usage_logs 
add column if not exists category text default 'uncategorized';

-- Create index on category for filtering
create index if not exists idx_agent_usage_logs_category on public.agent_usage_logs(category);
