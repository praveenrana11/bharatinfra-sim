-- Milestone 5E-7: Promote what-if scenario into next-round decision defaults
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.scenario_promotions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  target_round int not null check (target_round > 0),
  source_scenario_id uuid references public.what_if_scenarios(id) on delete set null,
  source_scenario_name text,
  promotion_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (user_id, session_id, team_id, target_round)
);

create index if not exists scenario_promotions_lookup_idx
  on public.scenario_promotions(user_id, session_id, team_id, target_round, updated_at desc);

alter table public.scenario_promotions enable row level security;

drop policy if exists "scenario_promotions_select_own" on public.scenario_promotions;
create policy "scenario_promotions_select_own"
  on public.scenario_promotions
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = scenario_promotions.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "scenario_promotions_insert_own" on public.scenario_promotions;
create policy "scenario_promotions_insert_own"
  on public.scenario_promotions
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = scenario_promotions.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "scenario_promotions_update_own" on public.scenario_promotions;
create policy "scenario_promotions_update_own"
  on public.scenario_promotions
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = scenario_promotions.team_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = scenario_promotions.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "scenario_promotions_delete_own" on public.scenario_promotions;
create policy "scenario_promotions_delete_own"
  on public.scenario_promotions
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = scenario_promotions.team_id
        and tm.user_id = auth.uid()
    )
  );
