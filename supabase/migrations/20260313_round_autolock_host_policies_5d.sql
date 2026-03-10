-- Milestone 5D: host auto-lock policies for decisions/results/points recompute
-- Safe to run multiple times.

alter table if exists public.decisions enable row level security;
alter table if exists public.team_results enable row level security;
alter table if exists public.teams enable row level security;

-- Host can read all decisions in their own session for auto-lock checks.
drop policy if exists "decisions_host_select_session" on public.decisions;
create policy "decisions_host_select_session"
  on public.decisions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.teams t
      join public.sessions s on s.id = t.session_id
      where t.id = decisions.team_id
        and t.session_id = decisions.session_id
        and s.created_by = auth.uid()
    )
  );

-- Host can insert auto-locked decision rows for teams in their session.
drop policy if exists "decisions_host_insert_session" on public.decisions;
create policy "decisions_host_insert_session"
  on public.decisions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.teams t
      join public.sessions s on s.id = t.session_id
      where t.id = decisions.team_id
        and t.session_id = decisions.session_id
        and s.created_by = auth.uid()
    )
  );

-- Host can update decisions in their session during close+auto-lock.
drop policy if exists "decisions_host_update_session" on public.decisions;
create policy "decisions_host_update_session"
  on public.decisions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.teams t
      join public.sessions s on s.id = t.session_id
      where t.id = decisions.team_id
        and t.session_id = decisions.session_id
        and s.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.teams t
      join public.sessions s on s.id = t.session_id
      where t.id = decisions.team_id
        and t.session_id = decisions.session_id
        and s.created_by = auth.uid()
    )
  );

-- Host can read results for all teams in their session.
drop policy if exists "team_results_host_select_session" on public.team_results;
create policy "team_results_host_select_session"
  on public.team_results
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.teams t
      join public.sessions s on s.id = t.session_id
      where t.id = team_results.team_id
        and t.session_id = team_results.session_id
        and s.created_by = auth.uid()
    )
  );

-- Host can insert generated results for teams in their session.
drop policy if exists "team_results_host_insert_session" on public.team_results;
create policy "team_results_host_insert_session"
  on public.team_results
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.teams t
      join public.sessions s on s.id = t.session_id
      where t.id = team_results.team_id
        and t.session_id = team_results.session_id
        and s.created_by = auth.uid()
    )
  );

-- Host can update already-generated results in their session.
drop policy if exists "team_results_host_update_session" on public.team_results;
create policy "team_results_host_update_session"
  on public.team_results
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.teams t
      join public.sessions s on s.id = t.session_id
      where t.id = team_results.team_id
        and t.session_id = team_results.session_id
        and s.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.teams t
      join public.sessions s on s.id = t.session_id
      where t.id = team_results.team_id
        and t.session_id = team_results.session_id
        and s.created_by = auth.uid()
    )
  );

-- Host can read team rows in sessions they created.
drop policy if exists "teams_host_select_owned_session" on public.teams;
create policy "teams_host_select_owned_session"
  on public.teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = teams.session_id
        and s.created_by = auth.uid()
    )
  );

-- Host can update team totals in sessions they created.
drop policy if exists "teams_host_update_owned_session" on public.teams;
create policy "teams_host_update_owned_session"
  on public.teams
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = teams.session_id
        and s.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = teams.session_id
        and s.created_by = auth.uid()
    )
  );
