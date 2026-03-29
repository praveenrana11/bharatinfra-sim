-- Milestone 5F3: enforce server-stamped submitted_at for locked decisions
-- Prevents client-side timestamp spoofing on lock.

alter table if exists public.decisions enable row level security;

create or replace function public.enforce_decision_lock_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.locked, false) then
      new.submitted_at := now();
    else
      new.submitted_at := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Once locked, keep immutable lock state and timestamp.
    if coalesce(old.locked, false) then
      new.locked := true;
      new.submitted_at := old.submitted_at;
      return new;
    end if;

    -- Transition from unlocked -> locked gets server time.
    if coalesce(new.locked, false) and not coalesce(old.locked, false) then
      new.submitted_at := now();
    else
      new.submitted_at := null;
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists decisions_lock_timestamp_guard on public.decisions;
create trigger decisions_lock_timestamp_guard
before insert or update on public.decisions
for each row
execute function public.enforce_decision_lock_timestamp();
