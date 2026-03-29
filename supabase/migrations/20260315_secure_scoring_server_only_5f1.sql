-- Milestone 5F1: secure scoring writes (server-only)
-- Keeps team_results readable to participants, but blocks direct client writes.
-- Intended to pair with /api/rounds/score service-role scoring.

alter table if exists public.team_results enable row level security;

-- Remove direct write policies if they exist from earlier iterations.
drop policy if exists "team_results_insert_team_members" on public.team_results;
drop policy if exists "team_results_update_team_members" on public.team_results;
drop policy if exists "team_results_insert_own_team" on public.team_results;
drop policy if exists "team_results_update_own_team" on public.team_results;
drop policy if exists "team_results_host_insert_session" on public.team_results;
drop policy if exists "team_results_host_update_session" on public.team_results;

-- Enforce server-only writes. Service role bypasses RLS and continues to work.
revoke insert, update, delete on table public.team_results from anon, authenticated;

-- Keep read access for authenticated users via existing RLS select policies.
grant select on table public.team_results to authenticated;
