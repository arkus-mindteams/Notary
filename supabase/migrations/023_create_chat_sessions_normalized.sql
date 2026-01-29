-- Migration: Create normalized chat sessions and messages with vector support

-- Enable pgvector extension if not exists
create extension if not exists vector;

-- Table: Chat Sessions
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text,
  summary text,
  archived boolean default false not null,
  pinned boolean default false not null,
  last_context jsonb, -- Snapshot of final context for resumption
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Table: Chat Messages
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.chat_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system', 'function', 'tool')),
  content text not null,
  metadata jsonb, -- For tokens, citations, processing time
  embedding vector(1536), -- For RAG / Semantic Search
  created_at timestamptz default now() not null
);

-- Indexes
create index if not exists idx_chat_sessions_user_updated 
  on public.chat_sessions(user_id, updated_at desc);

create index if not exists idx_chat_messages_session_created 
  on public.chat_messages(session_id, created_at asc);

-- RLS Policies
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

-- Sessions Policies
create policy "Users can view their own sessions"
  on public.chat_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sessions"
  on public.chat_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own sessions"
  on public.chat_sessions for update
  using (auth.uid() = user_id);

create policy "Users can delete their own sessions"
  on public.chat_sessions for delete
  using (auth.uid() = user_id);

-- Messages Policies
create policy "Users can view messages from their sessions"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = chat_messages.session_id
      and chat_sessions.user_id = auth.uid()
    )
  );

create policy "Users can insert messages to their sessions"
  on public.chat_messages for insert
  with check (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = chat_messages.session_id
      and chat_sessions.user_id = auth.uid()
    )
  );

-- Function to update updated_at on messages insert
create or replace function public.handle_new_message()
returns trigger as $$
begin
  update public.chat_sessions
  set updated_at = now()
  where id = new.session_id;
  return new;
end;
$$ language plpgsql;

create trigger on_new_message
  after insert on public.chat_messages
  for each row execute procedure public.handle_new_message();
