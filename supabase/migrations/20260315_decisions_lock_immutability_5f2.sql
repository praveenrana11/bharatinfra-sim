-- Milestone 5F2: make locked decisions immutable for client users
-- This blocks post-lock tampering attempts from authenticated clients.

alter table if exists public.decisions enable row level security;

-- Restrictive policy: once a row is locked=true, authenticated users cannot update it.
drop policy if exists "decisions_update_only_unlocked_rows" on public.decisions;
create policy "decisions_update_only_unlocked_rows"
  as restrictive
  on public.decisions
  for update
  to authenticated
  using (locked = false)
  with check (true);

-- Restrictive policy: authenticated users cannot delete decisions (prevents delete+reinsert bypass).
drop policy if exists "decisions_no_delete_authenticated" on public.decisions;
create policy "decisions_no_delete_authenticated"
  as restrictive
  on public.decisions
  for delete
  to authenticated
  using (false);
