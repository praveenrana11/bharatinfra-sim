-- Milestone 4E: Custom round-news template library (host owned)
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.news_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  sector_tags text[] not null default '{}',
  template_payload jsonb not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_templates_name_len check (char_length(name) between 3 and 120)
);

create index if not exists news_templates_created_by_idx
  on public.news_templates(created_by, created_at desc);

alter table if exists public.news_templates enable row level security;

drop policy if exists "news_templates_select_own" on public.news_templates;
create policy "news_templates_select_own"
  on public.news_templates
  for select
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "news_templates_insert_own" on public.news_templates;
create policy "news_templates_insert_own"
  on public.news_templates
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "news_templates_update_own" on public.news_templates;
create policy "news_templates_update_own"
  on public.news_templates
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "news_templates_delete_own" on public.news_templates;
create policy "news_templates_delete_own"
  on public.news_templates
  for delete
  to authenticated
  using (created_by = auth.uid());
