-- Keep teams.team_name aligned with the identity wizard company name
-- and allow team members to update that column during identity setup.

update public.teams
set team_name = nullif(btrim(identity_profile ->> 'company_name'), '')
where nullif(btrim(identity_profile ->> 'company_name'), '') is not null
  and team_name is distinct from nullif(btrim(identity_profile ->> 'company_name'), '');

create or replace function public.guard_teams_identity_member_updates()
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
    where tm.team_id = old.id
      and tm.user_id = caller_uid
  )
  into is_team_member;

  if not is_team_member then
    return new;
  end if;

  select exists (
    select 1
    from public.sessions s
    where s.id = old.session_id
      and s.created_by = caller_uid
  )
  into is_host;

  if is_host then
    return new;
  end if;

  if (to_jsonb(new) - array['identity_profile', 'identity_completed', 'scenario_id', 'team_name']::text[])
     is distinct from
     (to_jsonb(old) - array['identity_profile', 'identity_completed', 'scenario_id', 'team_name']::text[]) then
    raise exception 'team members may only update identity_profile, identity_completed, scenario_id, and team_name';
  end if;

  return new;
end;
$$;
