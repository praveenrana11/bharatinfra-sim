-- Milestone 5E-5: What-if scenario presets per user/team/session
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.what_if_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  scenario_name text not null check (char_length(trim(scenario_name)) between 1 and 80),
  mode text not null check (mode in ('stabilize', 'balanced', 'attack')),
  capex_shift int not null check (capex_shift between -20 and 20),
  subcontract_share int not null check (subcontract_share between 0 and 100),
  risk_control_budget int not null check (risk_control_budget between 0 and 25),
  notes text,
  projected_points int,
  projected_rank int,
  projected_debt numeric(8,1),
  confidence text check (confidence in ('High', 'Medium', 'Low')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id, team_id, scenario_name)
);

create index if not exists what_if_scenarios_lookup_idx
  on public.what_if_scenarios(user_id, session_id, team_id, updated_at desc);

alter table public.what_if_scenarios enable row level security;

drop policy if exists "what_if_scenarios_select_own" on public.what_if_scenarios;
create policy "what_if_scenarios_select_own"
  on public.what_if_scenarios
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = what_if_scenarios.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "what_if_scenarios_insert_own" on public.what_if_scenarios;
create policy "what_if_scenarios_insert_own"
  on public.what_if_scenarios
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = what_if_scenarios.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "what_if_scenarios_update_own" on public.what_if_scenarios;
create policy "what_if_scenarios_update_own"
  on public.what_if_scenarios
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = what_if_scenarios.team_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = what_if_scenarios.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "what_if_scenarios_delete_own" on public.what_if_scenarios;
create policy "what_if_scenarios_delete_own"
  on public.what_if_scenarios
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = what_if_scenarios.team_id
        and tm.user_id = auth.uid()
    )
  );
