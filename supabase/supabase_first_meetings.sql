-- InhaGo Supabase-first migration.
-- Review existing RLS policies and function definitions before applying in production.
-- Assumes public.meetings and public.meeting_participants already exist.
begin;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;

-- Restrictive policies are ANDed with all existing permissive policies.
-- They protect writes even if older permissive policies were overly broad.
drop policy if exists "inhago_meetings_insert_guard" on public.meetings;
create policy "inhago_meetings_insert_guard" on public.meetings
  as restrictive for insert to authenticated
  with check (creator_id = (select auth.uid()) and status = 'open'
    and meeting_time > now() and max_participants >= 2
    and length(btrim(title)) between 1 and 100
    and length(btrim(location_name)) > 0);

drop policy if exists "inhago_meetings_update_guard" on public.meetings;
create policy "inhago_meetings_update_guard" on public.meetings
  as restrictive for update to authenticated
  using (creator_id = (select auth.uid()) and status = 'open')
  with check (creator_id = (select auth.uid())
    and status in ('open', 'cancelled', 'completed')
    and max_participants >= 2
    and length(btrim(title)) between 1 and 100
    and length(btrim(location_name)) > 0);

drop policy if exists "inhago_participants_delete_guard" on public.meeting_participants;
create policy "inhago_participants_delete_guard" on public.meeting_participants
  as restrictive for delete to authenticated
  using (user_id = (select auth.uid()));

-- Explicit grants and permissive policies for required client reads/writes.
-- Existing policies may be more restrictive; inspect them before deployment.
grant select, insert, update on public.meetings to authenticated;
grant select, delete on public.meeting_participants to authenticated;

drop policy if exists "inhago_meetings_read" on public.meetings;
create policy "inhago_meetings_read" on public.meetings for select to authenticated using (true);
drop policy if exists "inhago_meetings_create" on public.meetings;
create policy "inhago_meetings_create" on public.meetings for insert to authenticated
  with check (creator_id = (select auth.uid()) and status = 'open');
drop policy if exists "inhago_meetings_owner_update" on public.meetings;
create policy "inhago_meetings_owner_update" on public.meetings for update to authenticated
  using (creator_id = (select auth.uid()) and status = 'open')
  with check (creator_id = (select auth.uid()));
drop policy if exists "inhago_participants_read" on public.meeting_participants;
create policy "inhago_participants_read" on public.meeting_participants for select to authenticated using (true);
drop policy if exists "inhago_participants_leave" on public.meeting_participants;
create policy "inhago_participants_leave" on public.meeting_participants for delete to authenticated
  using (user_id = (select auth.uid()));

-- Enforce status transitions in the database even for direct PostgREST updates.
-- A client must not bypass the completion-time check by updating status itself.
create or replace function public.inhago_guard_meeting_changes()
returns trigger language plpgsql security invoker set search_path = ''
as $
begin
  if new.creator_id is distinct from old.creator_id then
    raise exception '모임장은 변경할 수 없습니다.';
  end if;
  if old.status <> 'open' then
    raise exception '이미 종료된 모임은 수정할 수 없습니다.';
  end if;
  if new.status not in ('open', 'cancelled', 'completed') then
    raise exception '허용되지 않은 모임 상태입니다.';
  end if;
  if new.status = 'completed' and old.meeting_time > now() then
    raise exception '모임 예정 시간이 지나야 완료할 수 있습니다.';
  end if;
  if new.status = 'open' and new.meeting_time <= now() then
    raise exception '미래의 모임 시간만 설정할 수 있습니다.';
  end if;
  return new;
end;
$;
drop trigger if exists inhago_guard_meeting_changes on public.meetings;
create trigger inhago_guard_meeting_changes
before update on public.meetings
for each row execute function public.inhago_guard_meeting_changes();

-- Atomic completion: checks ownership and time inside Postgres, not the browser.
-- SECURITY INVOKER keeps RLS in force. The update_guard also restricts the transition.
create or replace function public.complete_meeting_safe(p_meeting_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare result public.meetings%rowtype;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  update public.meetings
     set status = 'completed'
   where id = p_meeting_id
     and creator_id = auth.uid()
     and status = 'open'
     and meeting_time <= now()
   returning * into result;
  if not found then
    raise exception '모임 시간이 지나지 않았거나 완료 권한이 없습니다.';
  end if;
  return jsonb_build_object('id', result.id, 'title', result.title, 'status', result.status);
end;
$$;
revoke all on function public.complete_meeting_safe(uuid) from public, anon;
grant execute on function public.complete_meeting_safe(uuid) to authenticated;
commit;

-- Before public launch, inspect all existing policies for meetings,
-- meeting_participants, friendships, chat_messages, profiles and manner_reviews.
-- Existing join_meeting_safe must be audited for membership, capacity and concurrency.
