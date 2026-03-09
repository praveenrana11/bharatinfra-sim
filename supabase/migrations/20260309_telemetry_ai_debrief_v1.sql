-- Telemetry + AI Debrief v1 (deterministic, privacy-first)
-- Safe to run once. Uses only pseudonymous auth user_id references.

create extension if not exists pgcrypto;

-- 1) Raw learner interaction telemetry (minimal)
create table if not exists public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  round_number int,
  event_name text not null,
  event_payload jsonb not null default '{}'::jsonb,
  client_ts timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists telemetry_events_user_idx
  on public.telemetry_events(user_id, created_at desc);
create index if not exists telemetry_events_team_round_idx
  on public.telemetry_events(team_id, round_number, created_at desc);

alter table public.telemetry_events enable row level security;

drop policy if exists "telemetry_select_own" on public.telemetry_events;
create policy "telemetry_select_own"
  on public.telemetry_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "telemetry_insert_own" on public.telemetry_events;
create policy "telemetry_insert_own"
  on public.telemetry_events
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      team_id is null
      or exists (
        select 1
        from public.team_memberships tm
        where tm.team_id = telemetry_events.team_id
          and tm.user_id = auth.uid()
      )
    )
  );

-- 2) AI feedback artifact (deterministic now, LLM wording later)
create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  round_number int not null check (round_number > 0),
  feedback_type text not null default 'round_debrief',
  summary text not null,
  strengths text[] not null default '{}',
  risks text[] not null default '{}',
  actions jsonb not null default '[]'::jsonb,
  model_name text not null default 'deterministic-v1',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id, team_id, round_number, feedback_type)
);

create index if not exists ai_feedback_user_round_idx
  on public.ai_feedback(user_id, session_id, round_number desc);

alter table public.ai_feedback enable row level security;

drop policy if exists "ai_feedback_select_own" on public.ai_feedback;
create policy "ai_feedback_select_own"
  on public.ai_feedback
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = ai_feedback.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "ai_feedback_insert_own" on public.ai_feedback;
create policy "ai_feedback_insert_own"
  on public.ai_feedback
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = ai_feedback.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "ai_feedback_update_own" on public.ai_feedback;
create policy "ai_feedback_update_own"
  on public.ai_feedback
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = ai_feedback.team_id
        and tm.user_id = auth.uid()
    )
  );

-- 3) Curriculum concept catalog
create table if not exists public.curriculum_concepts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.curriculum_concepts enable row level security;

drop policy if exists "concepts_select_authenticated" on public.curriculum_concepts;
create policy "concepts_select_authenticated"
  on public.curriculum_concepts
  for select
  to authenticated
  using (true);

-- 4) Per-learner concept mastery snapshot
create table if not exists public.concept_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  concept_id uuid not null references public.curriculum_concepts(id) on delete cascade,
  mastery_score int not null check (mastery_score between 0 and 100),
  evidence_count int not null default 0 check (evidence_count >= 0),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id, team_id, concept_id)
);

create index if not exists concept_mastery_lookup_idx
  on public.concept_mastery(user_id, session_id, team_id);

alter table public.concept_mastery enable row level security;

drop policy if exists "concept_mastery_select_own" on public.concept_mastery;
create policy "concept_mastery_select_own"
  on public.concept_mastery
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = concept_mastery.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "concept_mastery_insert_own" on public.concept_mastery;
create policy "concept_mastery_insert_own"
  on public.concept_mastery
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = concept_mastery.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "concept_mastery_update_own" on public.concept_mastery;
create policy "concept_mastery_update_own"
  on public.concept_mastery
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = concept_mastery.team_id
        and tm.user_id = auth.uid()
    )
  );

-- 5) Practice item bank
create table if not exists public.practice_items (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.curriculum_concepts(id) on delete cascade,
  difficulty smallint not null check (difficulty between 1 and 5),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  answer_key text not null,
  explanation text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (concept_id, prompt)
);

create index if not exists practice_items_concept_idx
  on public.practice_items(concept_id, difficulty);

alter table public.practice_items enable row level security;

drop policy if exists "practice_items_select_authenticated" on public.practice_items;
create policy "practice_items_select_authenticated"
  on public.practice_items
  for select
  to authenticated
  using (is_active = true);

-- 6) Practice attempt log
create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  concept_id uuid not null references public.curriculum_concepts(id) on delete cascade,
  item_id uuid not null references public.practice_items(id) on delete cascade,
  round_number int check (round_number > 0),
  selected_answer text not null,
  is_correct boolean not null,
  confidence smallint check (confidence between 1 and 5),
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  attempt_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists practice_attempts_user_idx
  on public.practice_attempts(user_id, created_at desc);
create index if not exists practice_attempts_session_round_idx
  on public.practice_attempts(session_id, round_number, created_at desc);

alter table public.practice_attempts enable row level security;

drop policy if exists "practice_attempts_select_own" on public.practice_attempts;
create policy "practice_attempts_select_own"
  on public.practice_attempts
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = practice_attempts.team_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "practice_attempts_insert_own" on public.practice_attempts;
create policy "practice_attempts_insert_own"
  on public.practice_attempts
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = practice_attempts.team_id
        and tm.user_id = auth.uid()
    )
  );

-- Seed minimal concept set (idempotent)
insert into public.curriculum_concepts (code, name, description)
values
  ('SCHED', 'Schedule Control', 'Planning buffers, sequencing, and delivery pacing.'),
  ('COST', 'Cost Control', 'Budget discipline, vendor tradeoffs, and cost efficiency.'),
  ('QUAL', 'Quality Assurance', 'Work quality decisions and defect prevention.'),
  ('STKH', 'Stakeholder Management', 'Alignment, expectation management, and communication.'),
  ('GOV', 'Governance & Claims', 'Governance intensity, safety, and claim defensibility.')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description;

-- Seed minimal practice bank (idempotent by unique(concept_id, prompt))
insert into public.practice_items (concept_id, difficulty, prompt, options, answer_key, explanation)
select c.id, 2,
  'Your SPI trend is below 1.0 for two rounds. What is the best first action?',
  '["Add 5-10% buffer to critical activities","Cut all quality checks immediately","Replace all vendors this week","Ignore trend until final round"]'::jsonb,
  'Add 5-10% buffer to critical activities',
  'Small targeted buffer and replanning typically improves schedule reliability without major disruption.'
from public.curriculum_concepts c
where c.code = 'SCHED'
on conflict (concept_id, prompt) do nothing;

insert into public.practice_items (concept_id, difficulty, prompt, options, answer_key, explanation)
select c.id, 2,
  'CPI has dropped below 1.0. Which decision usually helps first?',
  '["Increase cost focus and review procurement packages","Reduce stakeholder communication","Raise risk appetite immediately","Skip governance approvals"]'::jsonb,
  'Increase cost focus and review procurement packages',
  'Direct cost focus and procurement correction usually improves CPI faster than high-risk shortcuts.'
from public.curriculum_concepts c
where c.code = 'COST'
on conflict (concept_id, prompt) do nothing;

insert into public.practice_items (concept_id, difficulty, prompt, options, answer_key, explanation)
select c.id, 2,
  'Quality score is falling while speed focus is high. Best corrective action?',
  '["Shift some focus from speed to quality and strengthen checks","Increase speed further","Reduce stakeholder updates","Lower buffer to zero"]'::jsonb,
  'Shift some focus from speed to quality and strengthen checks',
  'Balanced reallocation prevents rework and improves long-term delivery performance.'
from public.curriculum_concepts c
where c.code = 'QUAL'
on conflict (concept_id, prompt) do nothing;

insert into public.practice_items (concept_id, difficulty, prompt, options, answer_key, explanation)
select c.id, 2,
  'Stakeholder score is weakest this round. What should your team prioritize?',
  '["Increase stakeholder focus and set communication cadence","Ignore stakeholders until last round","Cut quality budget","Use cheapest vendors only"]'::jsonb,
  'Increase stakeholder focus and set communication cadence',
  'Consistent stakeholder alignment reduces surprises and downstream friction.'
from public.curriculum_concepts c
where c.code = 'STKH'
on conflict (concept_id, prompt) do nothing;

insert into public.practice_items (concept_id, difficulty, prompt, options, answer_key, explanation)
select c.id, 2,
  'Claim entitlement score is weak. Which move is most defensible?',
  '["Increase governance rigor and maintain better decision records","Lower governance to speed approvals","Reduce team communication","Skip risk logs"]'::jsonb,
  'Increase governance rigor and maintain better decision records',
  'Stronger governance and documentation usually improve claim defensibility.'
from public.curriculum_concepts c
where c.code = 'GOV'
on conflict (concept_id, prompt) do nothing;
