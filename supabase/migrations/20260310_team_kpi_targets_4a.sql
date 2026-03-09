-- Milestone 4A: Team KPI target selection (4x multiplier trigger)
-- Safe to run multiple times.

alter table if exists public.teams
  add column if not exists kpi_target text;

alter table if exists public.teams
  add column if not exists kpi_selected_at timestamptz;

-- Guardrail check for known KPI values (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teams_kpi_target_check'
  ) then
    alter table public.teams
      add constraint teams_kpi_target_check
      check (
        kpi_target is null
        or kpi_target in (
          'Schedule Excellence',
          'Cost Leadership',
          'Quality Champion',
          'Safety First',
          'Stakeholder Trust',
          'Cash Discipline'
        )
      );
  end if;
end $$;
