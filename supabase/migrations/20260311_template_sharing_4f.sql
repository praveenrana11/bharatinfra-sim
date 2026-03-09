-- Milestone 4F: Template sharing controls (private/session)
-- Safe to run multiple times.

alter table if exists public.news_templates
  add column if not exists visibility_scope text not null default 'private';

alter table if exists public.news_templates
  add column if not exists session_id uuid references public.sessions(id) on delete cascade;

create index if not exists news_templates_session_scope_idx
  on public.news_templates(session_id, visibility_scope);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'news_templates_visibility_scope_check'
  ) then
    alter table public.news_templates
      add constraint news_templates_visibility_scope_check
      check (visibility_scope in ('private', 'session'));
  end if;
end $$;

alter table if exists public.news_templates enable row level security;

drop policy if exists "news_templates_select_own" on public.news_templates;
create policy "news_templates_select_own"
  on public.news_templates
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or (
      visibility_scope = 'session'
      and session_id is not null
      and exists (
        select 1
        from public.teams t
        join public.team_memberships tm on tm.team_id = t.id
        where t.session_id = news_templates.session_id
          and tm.user_id = auth.uid()
      )
    )
  );

drop policy if exists "news_templates_insert_own" on public.news_templates;
create policy "news_templates_insert_own"
  on public.news_templates
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      (visibility_scope = 'private' and session_id is null)
      or (
        visibility_scope = 'session'
        and session_id is not null
        and exists (
          select 1
          from public.sessions s
          where s.id = news_templates.session_id
            and s.created_by = auth.uid()
        )
      )
    )
  );

drop policy if exists "news_templates_update_own" on public.news_templates;
create policy "news_templates_update_own"
  on public.news_templates
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and (
      (visibility_scope = 'private' and session_id is null)
      or (
        visibility_scope = 'session'
        and session_id is not null
        and exists (
          select 1
          from public.sessions s
          where s.id = news_templates.session_id
            and s.created_by = auth.uid()
        )
      )
    )
  );

drop policy if exists "news_templates_delete_own" on public.news_templates;
create policy "news_templates_delete_own"
  on public.news_templates
  for delete
  to authenticated
  using (created_by = auth.uid());
