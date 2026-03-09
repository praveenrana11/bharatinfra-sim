-- Milestone 3B: Round orchestration + shared news/deadline state
-- Safe to run once. Adds optional orchestration table used by UI with fallback behavior.

create extension if not exists pgcrypto;

create table if not exists public.session_rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  round_number int not null check (round_number > 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  deadline_at timestamptz not null,
  news_payload jsonb not null default '[]'::jsonb,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, round_number)
);

create index if not exists session_rounds_session_round_idx
  on public.session_rounds(session_id, round_number);

create index if not exists session_rounds_deadline_idx
  on public.session_rounds(deadline_at);

alter table public.session_rounds enable row level security;

drop policy if exists "session_rounds_select_team_members" on public.session_rounds;
create policy "session_rounds_select_team_members"
  on public.session_rounds
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.teams t
      join public.team_memberships tm on tm.team_id = t.id
      where t.session_id = session_rounds.session_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "session_rounds_insert_host_only" on public.session_rounds;
create policy "session_rounds_insert_host_only"
  on public.session_rounds
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = session_rounds.session_id
        and s.created_by = auth.uid()
    )
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "session_rounds_update_host_only" on public.session_rounds;
create policy "session_rounds_update_host_only"
  on public.session_rounds
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_rounds.session_id
        and s.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = session_rounds.session_id
        and s.created_by = auth.uid()
    )
    and (created_by is null or created_by = auth.uid())
  );

-- Seed an open round row for existing in-progress sessions
insert into public.session_rounds (session_id, round_number, status, deadline_at, news_payload, created_by)
select
  s.id,
  greatest(coalesce(s.current_round, 0) + 1, 1) as round_number,
  'open' as status,
  now() + interval '35 minutes' as deadline_at,
  '[]'::jsonb as news_payload,
  s.created_by
from public.sessions s
where coalesce(s.status, 'pending') <> 'complete'
on conflict (session_id, round_number) do nothing;
