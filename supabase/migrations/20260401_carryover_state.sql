-- Consequence carryover state stored per scored round.
-- Safe to run multiple times.

alter table if exists public.team_results
  add column if not exists carryover_state jsonb not null default '{}'::jsonb;

alter table if exists public.team_results enable row level security;

grant select on table public.team_results to authenticated;
