-- Milestone 5F4: guard sensitive team fields from client tampering
-- Blocks non-service_role updates to total_points and KPI reselection.

alter table if exists public.teams enable row level security;

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

  -- Points are server-managed only.
  if new.total_points is distinct from old.total_points then
    raise exception 'total_points is server-managed and cannot be edited directly';
  end if;

  -- KPI target is one-time set and immutable after selection.
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
    -- selected_at should not be manually edited independently.
    if new.kpi_selected_at is distinct from old.kpi_selected_at then
      raise exception 'kpi_selected_at cannot be edited directly';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists teams_sensitive_guard on public.teams;
create trigger teams_sensitive_guard
before update on public.teams
for each row
execute function public.guard_teams_sensitive_updates();
