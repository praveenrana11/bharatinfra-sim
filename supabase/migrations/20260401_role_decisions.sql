-- Role-based decision ownership for functional specialists.

alter table if exists public.team_memberships
  add column if not exists member_role text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_memberships_member_role_check'
      and conrelid = 'public.team_memberships'::regclass
  ) then
    alter table public.team_memberships
      add constraint team_memberships_member_role_check
      check (
        member_role is null
        or member_role in (
          'project_director',
          'contracts_manager',
          'planning_manager',
          'hse_manager',
          'finance_head'
        )
      );
  end if;
end
$$;

create or replace function public.guard_team_membership_role_updates()
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
    where tm.team_id = old.team_id
      and tm.user_id = caller_uid
  )
  into is_team_member;

  if not is_team_member then
    return new;
  end if;

  select exists (
    select 1
    from public.teams t
    join public.sessions s on s.id = t.session_id
    where t.id = old.team_id
      and s.created_by = caller_uid
  )
  into is_host;

  if is_host then
    return new;
  end if;

  if (to_jsonb(new) - array['member_role']::text[])
     is distinct from
     (to_jsonb(old) - array['member_role']::text[]) then
    raise exception 'team members may only update member_role on team memberships';
  end if;

  return new;
end;
$$;

drop trigger if exists team_memberships_role_update_guard on public.team_memberships;
create trigger team_memberships_role_update_guard
before update on public.team_memberships
for each row
execute function public.guard_team_membership_role_updates();

drop policy if exists "team_memberships_members_update_member_role" on public.team_memberships;
create policy "team_memberships_members_update_member_role"
  on public.team_memberships
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = team_memberships.team_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = team_memberships.team_id
        and tm.user_id = auth.uid()
    )
  );
