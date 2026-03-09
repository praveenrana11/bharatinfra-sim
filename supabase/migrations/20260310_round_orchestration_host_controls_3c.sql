-- Milestone 3C: facilitator/host controls for round orchestration
-- Safe to run multiple times.

alter table if exists public.session_rounds enable row level security;

-- Remove older broad policies (if present)
drop policy if exists "session_rounds_insert_team_members" on public.session_rounds;
drop policy if exists "session_rounds_update_team_members" on public.session_rounds;

-- Ensure host-only mutation policies
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
