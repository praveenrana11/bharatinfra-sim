-- Liquidated damages: per-round LD tracking on results and running team total.
-- Safe to run multiple times.

alter table if exists public.team_results
  add column if not exists ld_triggered boolean not null default false,
  add column if not exists ld_amount_cr numeric not null default 0,
  add column if not exists ld_cumulative_cr numeric not null default 0,
  add column if not exists ld_weeks integer not null default 0,
  add column if not exists ld_capped boolean not null default false;

alter table if exists public.teams
  add column if not exists total_ld_cr numeric not null default 0;

alter table if exists public.team_results enable row level security;
alter table if exists public.teams enable row level security;

grant select on table public.team_results to authenticated;
grant select on table public.teams to authenticated;

drop policy if exists "team_results_members_select_own_team" on public.team_results;
create policy "team_results_members_select_own_team"
  on public.team_results
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = team_results.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "teams_members_select_own_team" on public.teams;
create policy "teams_members_select_own_team"
  on public.teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = teams.id
        and tm.user_id = auth.uid()
    )
  );

create or replace function public.guard_teams_sensitive_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(auth.role(), '');
begin
  if caller_role = 'service_role' then
    return new;
  end if;

  if new.total_points is distinct from old.total_points then
    raise exception 'total_points is server-managed and cannot be edited directly';
  end if;

  if new.total_ld_cr is distinct from old.total_ld_cr then
    raise exception 'total_ld_cr is server-managed and cannot be edited directly';
  end if;

  if new.kpi_target is distinct from old.kpi_target then
    if old.kpi_target is not null then
      raise exception 'kpi_target is already locked for this team';
    end if;

    if new.kpi_target is null or new.kpi_target not in (
      'SPI_TARGET',
      'CPI_TARGET',
      'ZERO_LTI',
      'QUALITY_85',
      'CASH_NON_NEGATIVE',
      'CLAIMS_70'
    ) then
      raise exception 'invalid kpi_target value';
    end if;

    if new.kpi_selected_at is null then
      new.kpi_selected_at := now();
    end if;
  else
    if new.kpi_selected_at is distinct from old.kpi_selected_at then
      raise exception 'kpi_selected_at cannot be edited directly';
    end if;
  end if;

  return new;
end;
$$;
