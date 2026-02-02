-- Create a table to track LLM agent usage
create table if not exists public.agent_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid, -- Optional link to a chat session
  model text not null,
  
  -- Token usage details
  tokens_input int default 0,
  tokens_output int default 0,
  total_tokens int default 0,
  
  -- Cost calculation (can be null if not calculated immediately)
  estimated_cost numeric(10, 6),
  
  -- Context
  action_type text, -- e.g., 'generate_question', 'extract_data', 'interpret_intent'
  metadata jsonb default '{}'::jsonb, -- Any extra info
  
  created_at timestamptz default now()
);

-- Add indexes for common queries
create index if not exists idx_agent_usage_logs_user_id on public.agent_usage_logs(user_id);
create index if not exists idx_agent_usage_logs_created_at on public.agent_usage_logs(created_at);
create index if not exists idx_agent_usage_logs_session_id on public.agent_usage_logs(session_id);

-- Enable RLS
alter table public.agent_usage_logs enable row level security;

-- Policies
-- Admins can view all logs (assuming we have an admin role or check)
-- For now, let's allow service role full access and users to view their own?
-- Usually these logs are for admins. Let's start restrictive.

create policy "Users can view their own usage logs"
  on public.agent_usage_logs for select
  using (auth.uid() = user_id);

-- We might need an admin policy later.
