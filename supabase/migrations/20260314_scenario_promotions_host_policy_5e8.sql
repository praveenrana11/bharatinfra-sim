-- Milestone 5E-8: host visibility for scenario promotions in facilitator console
-- Safe to run multiple times.

alter table if exists public.scenario_promotions enable row level security;

drop policy if exists "scenario_promotions_host_select_session" on public.scenario_promotions;
create policy "scenario_promotions_host_select_session"
  on public.scenario_promotions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = scenario_promotions.session_id
        and s.created_by = auth.uid()
    )
  );
