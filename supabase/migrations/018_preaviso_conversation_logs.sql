-- Migration: preaviso conversation logs
-- Purpose: guardar historial de chat (JSON) por conversación/trámite para debugging y QA

create extension if not exists pgcrypto;

create table if not exists public.preaviso_conversation_logs (
  conversation_id uuid primary key default gen_random_uuid(),
  tramite_id uuid null,
  user_id uuid null,
  plugin_id text null,

  -- Historial completo del chat (array de {role, content, ...})
  messages jsonb not null default '[]'::jsonb,

  -- Snapshots útiles para debugging
  last_user_message text null,
  last_assistant_message text null,
  context jsonb null,
  state jsonb null,
  meta jsonb null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists preaviso_conversation_logs_tramite_id_idx
  on public.preaviso_conversation_logs (tramite_id);

create index if not exists preaviso_conversation_logs_user_id_idx
  on public.preaviso_conversation_logs (user_id);

create index if not exists preaviso_conversation_logs_updated_at_idx
  on public.preaviso_conversation_logs (updated_at desc);

alter table public.preaviso_conversation_logs enable row level security;
-- Sin policies a propósito: solo service role (server) debe leer/escribir por ahora.

