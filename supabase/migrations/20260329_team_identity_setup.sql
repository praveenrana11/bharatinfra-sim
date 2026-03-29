-- Team identity setup: team onboarding profile + selectable project scenarios.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

alter table if exists public.teams
  add column if not exists identity_profile jsonb not null default '{}'::jsonb,
  add column if not exists identity_completed boolean not null default false;

create table if not exists public.project_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text not null,
  description text,
  base_budget_cr numeric,
  duration_rounds integer,
  complexity text not null check (complexity in ('moderate', 'high', 'extreme')),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_scenarios_name_client_key'
      and conrelid = 'public.project_scenarios'::regclass
  ) then
    alter table public.project_scenarios
      add constraint project_scenarios_name_client_key unique (name, client);
  end if;
end
$$;

alter table if exists public.teams
  add column if not exists scenario_id uuid references public.project_scenarios(id);

insert into public.project_scenarios (
  name,
  client,
  description,
  base_budget_cr,
  duration_rounds,
  complexity
)
select
  'Metro Rail Package',
  'DMRC',
  'Underground and elevated metro rail package covering civil works, stations, viaduct interfaces, and systems coordination for a dense urban corridor.',
  800,
  6,
  'extreme'
where not exists (
  select 1
  from public.project_scenarios
  where name = 'Metro Rail Package'
    and client = 'DMRC'
);

insert into public.project_scenarios (
  name,
  client,
  description,
  base_budget_cr,
  duration_rounds,
  complexity
)
select
  'Airport Terminal',
  'AAI',
  'Integrated terminal expansion with airside interfaces, MEP coordination, baggage systems, and phased passenger operations continuity.',
  650,
  5,
  'high'
where not exists (
  select 1
  from public.project_scenarios
  where name = 'Airport Terminal'
    and client = 'AAI'
);

insert into public.project_scenarios (
  name,
  client,
  description,
  base_budget_cr,
  duration_rounds,
  complexity
)
select
  'Industrial Plant',
  'SAIL',
  'Brownfield industrial plant package with structural, piping, utilities, and shutdown-linked execution constraints across multiple contractors.',
  420,
  4,
  'high'
where not exists (
  select 1
  from public.project_scenarios
  where name = 'Industrial Plant'
    and client = 'SAIL'
);

insert into public.project_scenarios (
  name,
  client,
  description,
  base_budget_cr,
  duration_rounds,
  complexity
)
select
  'Highway Package',
  'NHAI',
  'EPC highway package including earthworks, bridges, pavement, utilities shifting, and monsoon-sensitive corridor delivery planning.',
  380,
  4,
  'moderate'
where not exists (
  select 1
  from public.project_scenarios
  where name = 'Highway Package'
    and client = 'NHAI'
);

alter table if exists public.project_scenarios enable row level security;

drop policy if exists "project_scenarios_select_authenticated" on public.project_scenarios;
create policy "project_scenarios_select_authenticated"
  on public.project_scenarios
  for select
  to authenticated
  using (true);

drop policy if exists "teams_members_update_identity_fields" on public.teams;
create policy "teams_members_update_identity_fields"
  on public.teams
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = teams.id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = teams.id
        and tm.user_id = auth.uid()
    )
  );

create or replace function public.guard_teams_identity_member_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_uid uuid := auth.uid();
  caller_role text := coalesce(auth.role(), '');
  is_team_member boolean := false;
  is_host boolean := false;
begin
  if caller_role = 'service_role' then
    return new;
  end if;

  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = old.id
      and tm.user_id = caller_uid
  )
  into is_team_member;

  if not is_team_member then
    return new;
  end if;

  select exists (
    select 1
    from public.sessions s
    where s.id = old.session_id
      and s.created_by = caller_uid
  )
  into is_host;

  if is_host then
    return new;
  end if;

  if (to_jsonb(new) - array['identity_profile', 'identity_completed', 'scenario_id']::text[])
     is distinct from
     (to_jsonb(old) - array['identity_profile', 'identity_completed', 'scenario_id']::text[]) then
    raise exception 'team members may only update identity_profile, identity_completed, and scenario_id';
  end if;

  return new;
end;
$$;

drop trigger if exists teams_identity_member_guard on public.teams;
create trigger teams_identity_member_guard
before update on public.teams
for each row
execute function public.guard_teams_identity_member_updates();
