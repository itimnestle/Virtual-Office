-- =============================================================================
-- Milestone C — work operations
-- Deadline-extension requests (reminders paused while pending), daily due
-- reminders from 7 days out, leave/due-date conflict notices (never automatic
-- changes), company holidays, comments with @mentions, recurring tasks,
-- rule-based assignment suggestions, Director notices on urgent-task changes.
-- =============================================================================

create type public.change_request_status as enum ('pending', 'approved', 'rejected');
create type public.recurrence_freq as enum ('daily', 'weekly', 'monthly', 'yearly', 'custom');

-- -----------------------------------------------------------------------------
-- Task columns
-- -----------------------------------------------------------------------------
alter table public.tasks
  -- Days before the due date to start daily reminders; 0 turns them off.
  add column reminder_days smallint not null default 7 check (reminder_days between 0 and 30),
  add column recurrence_rule_id uuid,
  add column recurrence_on date;

-- -----------------------------------------------------------------------------
-- Generic helper: can a GIVEN user open a task? (Same rule as can_view_task,
-- evaluated for someone other than the caller — used before notifying them.)
-- -----------------------------------------------------------------------------
create or replace function private.can_user_view_task(p_task_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tasks t
    join public.profiles u on u.id = p_user and u.is_active and u.org_id = t.org_id
    where t.id = p_task_id
      and (
        u.role in ('director', 'admin')
        or t.created_by = p_user
        or exists (select 1 from public.task_assignees a where a.task_id = t.id and a.user_id = p_user)
        or exists (select 1 from public.team_members tm where tm.team_id = t.team_id and tm.user_id = p_user and tm.is_lead)
        or (not t.is_private and exists (select 1 from public.team_members tm where tm.team_id = t.team_id and tm.user_id = p_user))
      )
  );
$$;

-- Active Managers leading the task's team; the Directors when there are none.
create or replace function private.task_leads(p_task_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.reviewers_for(p_task_id, 'manager');
$$;

create or replace function private.org_directors(p_org uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p where p.org_id = p_org and p.is_active and p.role = 'director';
$$;

-- -----------------------------------------------------------------------------
-- Company holidays (Admin-managed)
-- -----------------------------------------------------------------------------
create table public.company_holidays (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  holiday_on  date not null,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  created_at  timestamptz not null default now(),
  unique (org_id, holiday_on)
);

-- Working hours a person has between two Bangkok dates (inclusive):
-- Monday–Saturday 8h, minus company holidays, minus leave (half day = 4h).
create or replace function private.available_hours(p_user uuid, p_from date, p_to date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case
      when extract(isodow from d) = 7 then 0
      when exists (select 1 from public.company_holidays h join public.profiles p on p.id = p_user
                   where h.org_id = p.org_id and h.holiday_on = d::date) then 0
      when exists (select 1 from public.member_absences a where a.user_id = p_user and d::date between a.starts_on and a.ends_on and a.part = 'full_day') then 0
      when exists (select 1 from public.member_absences a where a.user_id = p_user and a.starts_on = d::date and a.part in ('am', 'pm')) then 4
      else 8
    end
  ), 0)
  from generate_series(p_from, greatest(p_from, p_to), interval '1 day') d;
$$;

-- -----------------------------------------------------------------------------
-- Deadline change (extension) requests
-- -----------------------------------------------------------------------------
create table public.task_change_requests (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  task_id          uuid not null,
  requested_by     uuid not null,
  current_due_at   timestamptz,
  proposed_due_at  timestamptz not null,
  reason           text not null check (char_length(btrim(reason)) between 1 and 2000),
  status           public.change_request_status not null default 'pending',
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text check (char_length(decision_note) <= 2000),
  created_at       timestamptz not null default now(),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete restrict,
  foreign key (requested_by, org_id) references public.profiles (id, org_id) on delete restrict,
  foreign key (decided_by, org_id) references public.profiles (id, org_id) on delete restrict
);
create unique index task_change_requests_one_pending on public.task_change_requests (task_id) where status = 'pending';
create index task_change_requests_task_idx on public.task_change_requests (task_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Comments with @mentions
-- -----------------------------------------------------------------------------
create table public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  task_id     uuid not null,
  author_id   uuid not null,
  body        text not null check (char_length(btrim(body)) between 1 and 5000),
  mentions    uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete restrict,
  foreign key (author_id, org_id) references public.profiles (id, org_id) on delete restrict
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);
create trigger task_comments_append_only before update or delete on public.task_comments
  for each row execute function private.block_mutation();
create trigger task_comments_archive_guard before insert on public.task_comments
  for each row execute function private.block_child_of_archived_task();
create trigger task_change_requests_archive_guard before insert on public.task_change_requests
  for each row execute function private.block_child_of_archived_task();

-- -----------------------------------------------------------------------------
-- Recurrence
-- -----------------------------------------------------------------------------
create table public.task_recurrence_rules (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  template_task_id  uuid not null unique,
  freq              public.recurrence_freq not null,
  -- every N days (daily/custom), weeks (weekly), months (monthly) or years (yearly)
  interval_n        smallint not null default 1 check (interval_n between 1 and 365),
  -- ISO weekdays (1 = Monday) for weekly rules
  weekdays          smallint[] not null default '{}',
  -- 1..31; months without that day use their last day
  day_of_month      smallint check (day_of_month between 1 and 31),
  due_time          time not null default '17:00',
  starts_on         date not null,
  until_on          date,
  next_run_on       date,
  active            boolean not null default true,
  created_by        uuid not null,
  created_at        timestamptz not null default now(),
  unique (id, org_id),
  foreign key (template_task_id, org_id) references public.tasks (id, org_id) on delete restrict,
  foreign key (created_by, org_id) references public.profiles (id, org_id) on delete restrict,
  check (until_on is null or until_on >= starts_on),
  check (freq <> 'weekly' or cardinality(weekdays) > 0)
);

alter table public.tasks
  add constraint tasks_recurrence_rule_fk foreign key (recurrence_rule_id, org_id)
    references public.task_recurrence_rules (id, org_id) on delete restrict;
create unique index tasks_recurrence_instance_key on public.tasks (recurrence_rule_id, recurrence_on)
  where recurrence_rule_id is not null;

-- First occurrence strictly after p_after (Bangkok calendar dates).
create or replace function private.next_occurrence(p_rule public.task_recurrence_rules, p_after date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_k      integer;
  v_d      date;
  v_month  date;
  v_week0  date;
begin
  if p_rule.freq in ('daily', 'custom') then
    if p_after < p_rule.starts_on then
      return p_rule.starts_on;
    end if;
    v_k := floor((p_after - p_rule.starts_on) / p_rule.interval_n)::int + 1;
    return p_rule.starts_on + v_k * p_rule.interval_n;
  end if;

  if p_rule.freq = 'weekly' then
    v_week0 := p_rule.starts_on - (extract(isodow from p_rule.starts_on)::int - 1);
    v_d := greatest(p_after + 1, p_rule.starts_on);
    for i in 0 .. (7 * p_rule.interval_n * 2) loop
      if extract(isodow from v_d)::smallint = any (p_rule.weekdays)
         and ((v_d - v_week0) / 7) % p_rule.interval_n = 0 then
        return v_d;
      end if;
      v_d := v_d + 1;
    end loop;
    return null;
  end if;

  -- monthly / yearly: step from the start month, clamp to the month's last day.
  for v_k in 0 .. 5000 loop
    v_month := date_trunc('month', p_rule.starts_on)::date
               + make_interval(months => case when p_rule.freq = 'monthly' then v_k * p_rule.interval_n
                                              else v_k * p_rule.interval_n * 12 end);
    v_d := v_month + (least(
             coalesce(p_rule.day_of_month, extract(day from p_rule.starts_on)::smallint),
             extract(day from (v_month + interval '1 month - 1 day'))::int
           ) - 1);
    if v_d > p_after and v_d >= p_rule.starts_on then
      return v_d;
    end if;
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Directory v2: adds derived labels (pending extension, assignee on leave today)
-- -----------------------------------------------------------------------------
drop function public.task_directory(uuid);
create function public.task_directory(p_team_id uuid default null)
returns table (
  id                     uuid,
  team_id                uuid,
  title                  text,
  is_private             boolean,
  redacted               boolean,
  status                 public.task_status,
  priority               public.task_priority,
  is_urgent              boolean,
  size                   public.task_size,
  estimated_hours        numeric,
  due_at                 timestamptz,
  created_by             uuid,
  created_at             timestamptz,
  archived_at            timestamptz,
  assignee_ids           uuid[],
  is_new_today           boolean,
  has_pending_extension  boolean,
  assignee_absent_today  boolean,
  is_recurring           boolean,
  category_id            uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.team_id,
    t.title,
    t.is_private,
    not v.ok,
    case when v.ok then t.status end,
    case when v.ok then t.priority end,
    case when v.ok then t.is_urgent end,
    case when v.ok then t.size end,
    case when v.ok then t.estimated_hours end,
    case when v.ok then t.due_at end,
    case when v.ok then t.created_by end,
    case when v.ok then t.created_at end,
    case when v.ok then t.archived_at end,
    case when v.ok then array(
      select a.user_id from public.task_assignees a where a.task_id = t.id order by a.assigned_at
    ) end,
    case when v.ok then
      (t.created_at at time zone 'Asia/Bangkok')::date = (now() at time zone 'Asia/Bangkok')::date
    end,
    case when v.ok then exists (
      select 1 from public.task_change_requests r where r.task_id = t.id and r.status = 'pending'
    ) end,
    case when v.ok then exists (
      select 1 from public.task_assignees a join public.member_absences ab on ab.user_id = a.user_id
      where a.task_id = t.id and (now() at time zone 'Asia/Bangkok')::date between ab.starts_on and ab.ends_on
    ) end,
    case when v.ok then (t.recurrence_rule_id is not null
      or exists (select 1 from public.task_recurrence_rules r where r.template_task_id = t.id and r.active)) end,
    case when v.ok then t.category_id end
  from public.tasks t
  cross join lateral (select private.can_view_task(t.id) as ok) v
  where t.org_id = private.my_org_id()
    and (p_team_id is null or t.team_id = p_team_id)
    and (v.ok or (t.is_private and private.is_team_member(t.team_id)))
  order by t.created_at desc;
$$;

-- -----------------------------------------------------------------------------
-- Leave ↔ due date conflicts: notify the leads, never change the task.
-- -----------------------------------------------------------------------------
create or replace function private.notify_leave_conflicts(p_task_id uuid, p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t public.tasks;
  v_due date;
begin
  select * into v_t from public.tasks where id = p_task_id;
  if v_t.id is null or v_t.due_at is null or v_t.archived_at is not null
     or v_t.status in ('completed', 'cancelled') then
    return;
  end if;
  v_due := (v_t.due_at at time zone 'Asia/Bangkok')::date;

  insert into public.notifications (org_id, user_id, kind, payload, task_id, actor_id, dedupe_key)
  select v_t.org_id, l.uid, 'leave_due_conflict',
         jsonb_build_object('task_title', v_t.title, 'member_name', private.actor_name(a.user_id), 'due_date', v_due),
         v_t.id, null, format('leave_conflict:%s:%s:%s:%s', v_t.id, a.user_id, ab.id, v_due)
  from public.task_assignees a
  join public.member_absences ab on ab.user_id = a.user_id and v_due between ab.starts_on and ab.ends_on
  -- Whoever decides on this work: Member work → team Manager(s), Manager work → Director.
  cross join lateral (select private.reviewers_for(v_t.id, private.review_level_for(v_t.id)) as uid) l
  where a.task_id = v_t.id and (p_user is null or a.user_id = p_user)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

create or replace function private.on_absence_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select a.task_id from public.task_assignees a
    join public.tasks t on t.id = a.task_id
    where a.user_id = new.user_id and t.due_at is not null and t.archived_at is null
      and (t.due_at at time zone 'Asia/Bangkok')::date between new.starts_on and new.ends_on
  loop
    perform private.notify_leave_conflicts(r.task_id, new.user_id);
  end loop;
  return null;
end;
$$;
create trigger member_absences_conflicts after insert or update on public.member_absences
  for each row execute function private.on_absence_change();

create or replace function private.on_task_due_or_assignee_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'tasks' then
    perform private.notify_leave_conflicts(new.id, null);
  else
    perform private.notify_leave_conflicts(new.task_id, new.user_id);
  end if;
  return null;
end;
$$;
create trigger tasks_due_conflicts after insert or update of due_at on public.tasks
  for each row execute function private.on_task_due_or_assignee_change();
create trigger task_assignees_conflicts after insert on public.task_assignees
  for each row execute function private.on_task_due_or_assignee_change();

-- -----------------------------------------------------------------------------
-- Urgent tasks: the Director hears about every important change.
-- -----------------------------------------------------------------------------
create or replace function private.on_urgent_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb := '{}';
begin
  if not new.is_urgent then
    return null;
  end if;
  if new.due_at is distinct from old.due_at then
    v_changes := v_changes || jsonb_build_object('due_at', jsonb_build_array(old.due_at, new.due_at));
  end if;
  if new.priority is distinct from old.priority then
    v_changes := v_changes || jsonb_build_object('priority', jsonb_build_array(old.priority, new.priority));
  end if;
  if new.status is distinct from old.status then
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_array(old.status, new.status));
  end if;
  if v_changes = '{}' then
    return null;
  end if;
  perform private.notify(
    new.org_id, array(select private.org_directors(new.org_id)), 'urgent_task_changed',
    jsonb_build_object('task_title', new.title, 'actor_name', coalesce(private.actor_name(auth.uid()), ''), 'changes', v_changes),
    new.id
  );
  return null;
end;
$$;
create trigger tasks_urgent_changes after update on public.tasks
  for each row execute function private.on_urgent_task_change();

-- -----------------------------------------------------------------------------
-- RPCs: extension requests
-- -----------------------------------------------------------------------------
create or replace function public.request_due_change(p_task_id uuid, p_proposed_due_at timestamptz, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t   public.tasks;
  v_id  uuid;
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id() for update;
  if not found or not private.can_view_task(p_task_id) then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  if v_t.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  if not private.is_assignee(p_task_id, v_uid) then
    raise exception 'only_assignees_can_request' using errcode = '42501';
  end if;
  if v_t.status in ('completed', 'cancelled') then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if p_proposed_due_at is null or p_proposed_due_at <= now() then
    raise exception 'proposed_due_in_past' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) = 0 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if exists (select 1 from public.task_change_requests where task_id = p_task_id and status = 'pending') then
    raise exception 'request_already_pending' using errcode = '23505';
  end if;

  insert into public.task_change_requests (org_id, task_id, requested_by, current_due_at, proposed_due_at, reason)
  values (v_t.org_id, p_task_id, v_uid, v_t.due_at, p_proposed_due_at, btrim(p_reason))
  returning id into v_id;

  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_t.org_id, p_task_id, v_uid, 'extension_requested',
          jsonb_build_object('request_id', v_id, 'from', v_t.due_at, 'to', p_proposed_due_at));

  perform private.notify(
    v_t.org_id,
    array(select private.reviewers_for(p_task_id, private.review_level_for(p_task_id)))
      || case when v_t.is_urgent then array(select private.org_directors(v_t.org_id)) else '{}'::uuid[] end,
    'extension_requested',
    jsonb_build_object('task_title', v_t.title, 'actor_name', private.actor_name(v_uid)), p_task_id
  );
  return v_id;
end;
$$;

create or replace function public.decide_due_change(p_request_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r   public.task_change_requests;
  v_t   public.tasks;
begin
  select * into v_r from public.task_change_requests
  where id = p_request_id and org_id = private.my_org_id() for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  select * into v_t from public.tasks where id = v_r.task_id for update;
  if v_r.status <> 'pending' then
    raise exception 'request_already_decided' using errcode = '22023';
  end if;
  if v_t.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  if not (v_uid in (select private.reviewers_for(v_t.id, private.review_level_for(v_t.id)))) then
    raise exception 'not_reviewer' using errcode = '42501';
  end if;

  update public.task_change_requests
  set status = case when p_approve then 'approved'::public.change_request_status else 'rejected' end,
      decided_by = v_uid, decided_at = now(), decision_note = nullif(btrim(p_note), '')
  where id = v_r.id;

  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_t.org_id, v_t.id, v_uid, case when p_approve then 'extension_approved' else 'extension_rejected' end,
          jsonb_build_object('request_id', v_r.id, 'from', v_t.due_at, 'to', v_r.proposed_due_at,
                             'note', nullif(btrim(p_note), '')));

  perform private.notify(
    v_t.org_id, array(select a.user_id from public.task_assignees a where a.task_id = v_t.id),
    case when p_approve then 'extension_approved' else 'extension_rejected' end,
    jsonb_build_object('task_title', v_t.title, 'actor_name', private.actor_name(v_uid)), v_t.id
  );

  if p_approve then
    -- Triggers handle Director notice (urgent) and leave-conflict checks.
    update public.tasks set due_at = v_r.proposed_due_at where id = v_t.id;
  end if;
end;
$$;

-- UI helper: is the caller the reviewer for this task (extensions, reviews)?
create or replace function public.is_task_reviewer(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_task(p_task_id)
     and auth.uid() in (select private.reviewers_for(p_task_id, private.review_level_for(p_task_id)));
$$;

-- Leads change deadline / priority / size / reminders directly (audited).
create or replace function public.update_task_details(
  p_task_id uuid,
  p_due_at timestamptz default null,
  p_clear_due boolean default false,
  p_priority public.task_priority default null,
  p_size public.task_size default null,
  p_estimated_hours numeric default null,
  p_reminder_days smallint default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t public.tasks;
  v_new public.tasks;
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id() for update;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  if v_t.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  if not private.leads_team(v_t.team_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reminder_days is not null and p_reminder_days not between 0 and 30 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  update public.tasks set
    due_at = case when p_clear_due then null else coalesce(p_due_at, due_at) end,
    priority = coalesce(p_priority, priority),
    size = coalesce(p_size, size),
    estimated_hours = coalesce(p_estimated_hours, estimated_hours),
    reminder_days = coalesce(p_reminder_days, reminder_days)
  where id = p_task_id
  returning * into v_new;

  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_t.org_id, p_task_id, auth.uid(), 'details_changed', jsonb_strip_nulls(jsonb_build_object(
    'due_at', case when v_new.due_at is distinct from v_t.due_at then jsonb_build_array(v_t.due_at, v_new.due_at) end,
    'priority', case when v_new.priority is distinct from v_t.priority then jsonb_build_array(v_t.priority, v_new.priority) end,
    'size', case when v_new.size is distinct from v_t.size then jsonb_build_array(v_t.size, v_new.size) end,
    'estimated_hours', case when v_new.estimated_hours is distinct from v_t.estimated_hours then jsonb_build_array(v_t.estimated_hours, v_new.estimated_hours) end,
    'reminder_days', case when v_new.reminder_days is distinct from v_t.reminder_days then jsonb_build_array(v_t.reminder_days, v_new.reminder_days) end
  )));
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs: comments
-- -----------------------------------------------------------------------------
create or replace function public.add_task_comment(p_task_id uuid, p_body text, p_mentions uuid[] default '{}')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_t        public.tasks;
  v_mentions uuid[];
  v_id       uuid;
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id();
  if not found or not private.can_view_task(p_task_id) then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  if v_t.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_body)), 0) = 0 then
    raise exception 'comment_required' using errcode = '22023';
  end if;
  -- Only people who may open the task can be mentioned (and notified).
  v_mentions := coalesce(array(
    select distinct m from unnest(coalesce(p_mentions, '{}')) m
    where m <> v_uid and private.can_user_view_task(p_task_id, m)
  ), '{}');

  insert into public.task_comments (org_id, task_id, author_id, body, mentions)
  values (v_t.org_id, p_task_id, v_uid, btrim(p_body), v_mentions)
  returning id into v_id;

  perform private.notify(
    v_t.org_id, v_mentions, 'mentioned',
    jsonb_build_object('task_title', v_t.title, 'actor_name', private.actor_name(v_uid),
                       'excerpt', left(btrim(p_body), 140)),
    p_task_id
  );
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs: recurrence
-- -----------------------------------------------------------------------------
create or replace function public.set_task_recurrence(
  p_task_id uuid,
  p_freq public.recurrence_freq,
  p_interval smallint default 1,
  p_weekdays smallint[] default '{}',
  p_day_of_month smallint default null,
  p_due_time time default '17:00',
  p_until date default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t     public.tasks;
  v_rule  public.task_recurrence_rules;
  v_start date;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id() for update;
  if not found or not private.can_view_task(p_task_id) then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  if not (private.leads_team(v_t.team_id) or v_t.created_by = auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_t.recurrence_rule_id is not null then
    raise exception 'instance_not_template' using errcode = '22023';
  end if;
  if p_freq = 'weekly' and coalesce(cardinality(p_weekdays), 0) = 0 then
    raise exception 'weekdays_required' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_weekdays, '{}')) w where w not between 1 and 7) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  v_start := coalesce((v_t.due_at at time zone 'Asia/Bangkok')::date, v_today);

  insert into public.task_recurrence_rules (
    org_id, template_task_id, freq, interval_n, weekdays, day_of_month, due_time, starts_on, until_on, created_by
  ) values (
    v_t.org_id, v_t.id, p_freq, greatest(coalesce(p_interval, 1), 1), coalesce(p_weekdays, '{}'), p_day_of_month,
    coalesce(p_due_time, '17:00'), v_start, p_until, auth.uid()
  )
  on conflict (template_task_id) do update set
    freq = excluded.freq, interval_n = excluded.interval_n, weekdays = excluded.weekdays,
    day_of_month = excluded.day_of_month, due_time = excluded.due_time, until_on = excluded.until_on,
    active = true
  returning * into v_rule;

  -- The template is occurrence #1; the next one comes after max(start, today - 1).
  update public.task_recurrence_rules
  set next_run_on = private.next_occurrence(v_rule, greatest(v_rule.starts_on, v_today - 1))
  where id = v_rule.id;

  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_t.org_id, v_t.id, auth.uid(), 'recurrence_set',
          jsonb_build_object('freq', p_freq, 'interval', p_interval, 'weekdays', p_weekdays,
                             'day_of_month', p_day_of_month, 'until', p_until));
  return v_rule.id;
end;
$$;

create or replace function public.stop_task_recurrence(p_task_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t public.tasks;
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id();
  if not found or not (private.leads_team(v_t.team_id) or v_t.created_by = auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.task_recurrence_rules set active = false where template_task_id = p_task_id;
  insert into public.task_audit_logs (org_id, task_id, actor_id, action)
  values (v_t.org_id, v_t.id, auth.uid(), 'recurrence_stopped');
end;
$$;

-- -----------------------------------------------------------------------------
-- Rule-based assignment suggestions (deterministic, explained; not AI/ML).
--   score = 40·capacity + 25·(1 − load) + 20·skill + 15·(not on leave at due)
--   capacity = clamp(free_hours / needed_hours, 0..2) / 2
--   free_hours = working hours until due (Mon–Sat 8h, minus holidays/leave)
--                − estimated hours of the person's open tasks
--   load = min(open_tasks / 8, 1); skill = level / 5 (0.5 when no skill chosen)
-- The lead always decides; nothing is assigned automatically.
-- -----------------------------------------------------------------------------
create or replace function public.suggest_assignees(
  p_team_id uuid,
  p_size public.task_size default null,
  p_estimated_hours numeric default null,
  p_due_at timestamptz default null,
  p_skill_id uuid default null
)
returns table (
  user_id          uuid,
  score            integer,
  open_tasks       integer,
  open_hours       numeric,
  available_hours  numeric,
  free_hours       numeric,
  needed_hours     numeric,
  skill_level      integer,
  on_leave_at_due  boolean,
  components       jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_due   date := coalesce((p_due_at at time zone 'Asia/Bangkok')::date, v_today + 7);
  v_need  numeric := coalesce(p_estimated_hours,
                      case p_size when 'xs' then 1 when 's' then 4 when 'm' then 8 when 'l' then 16 when 'xl' then 32 else 4 end);
begin
  if not private.leads_team(p_team_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
  with people as (
    select p.id
    from public.team_members tm
    join public.profiles p on p.id = tm.user_id and p.is_active and p.role in ('member', 'manager')
    where tm.team_id = p_team_id
  ), load as (
    select pe.id,
           count(t.id)::int as n,
           coalesce(sum(t.estimated_hours), 0) as hrs
    from people pe
    left join public.task_assignees a on a.user_id = pe.id
    left join public.tasks t on t.id = a.task_id and t.archived_at is null
         and t.status not in ('completed', 'cancelled')
    group by pe.id
  ), calc as (
    select l.id, l.n, l.hrs,
           private.available_hours(l.id, v_today, v_due) as avail,
           (select ms.level from public.member_skills ms where ms.user_id = l.id and ms.skill_id = p_skill_id) as lvl,
           exists (select 1 from public.member_absences ab
                   where ab.user_id = l.id and v_due between ab.starts_on and ab.ends_on) as leave
    from load l
  ), scored as (
    select c.*,
           greatest(least((c.avail - c.hrs) / nullif(v_need, 0), 2), 0) / 2 as cap,
           1 - least(c.n / 8.0, 1) as lightness,
           case when p_skill_id is null then 0.5 else coalesce(c.lvl, 0) / 5.0 end as sk,
           case when c.leave then 0 else 1 end as present
    from calc c
  )
  select s.id,
         round(100 * (0.40 * s.cap + 0.25 * s.lightness + 0.20 * s.sk + 0.15 * s.present))::int,
         s.n, s.hrs::numeric, s.avail::numeric, (s.avail - s.hrs)::numeric, v_need, s.lvl::int, s.leave,
         jsonb_build_object(
           'capacity', round(40 * s.cap, 1), 'workload', round(25 * s.lightness, 1),
           'skill', round(20 * s.sk, 1), 'availability', 15 * s.present
         )
  from scored s
  order by 2 desc, (s.avail - s.hrs) desc, s.n asc, s.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Scheduled jobs (idempotent; dedupe keys per day / per occurrence)
-- -----------------------------------------------------------------------------

-- Daily due reminders from reminder_days (default 7) before the due date
-- through the due date. Paused while an extension request is pending.
-- Sundays are skipped except on the due date itself.
create or replace function public.run_due_reminders(p_now timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run   bigint;
  v_today date := (p_now at time zone 'Asia/Bangkok')::date;
  v_sent  integer;
begin
  insert into public.job_runs (job) values ('due_reminders') returning id into v_run;

  with due as (
    select t.id, t.org_id, t.title, (t.due_at at time zone 'Asia/Bangkok')::date as due_d
    from public.tasks t
    where t.archived_at is null
      and t.due_at is not null
      and t.status not in ('completed', 'cancelled', 'in_review')
      and t.reminder_days > 0
      and (t.due_at at time zone 'Asia/Bangkok')::date - v_today between 0 and t.reminder_days
      and not exists (select 1 from public.task_change_requests r where r.task_id = t.id and r.status = 'pending')
  ), filtered as (
    select * from due d where extract(isodow from v_today) <> 7 or d.due_d = v_today
  ), recipients as (
    select f.*, a.user_id as uid from filtered f join public.task_assignees a on a.task_id = f.id
    union
    select f.*, l from filtered f cross join lateral private.task_leads(f.id) l
    union
    select f.*, d from filtered f cross join lateral private.org_directors(f.org_id) d
  ), inserted as (
    insert into public.notifications (org_id, user_id, kind, payload, task_id, dedupe_key)
    select r.org_id, r.uid, 'due_reminder',
           jsonb_build_object('task_title', r.title, 'days_left', r.due_d - v_today, 'due_date', r.due_d),
           r.id, format('due:%s:%s', r.id, v_today)
    from recipients r
    join public.profiles p on p.id = r.uid and p.is_active
    on conflict (user_id, dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_sent from inserted;

  update public.job_runs set finished_at = clock_timestamp(), status = 'succeeded', affected = v_sent where id = v_run;
  return v_sent;
exception when others then
  insert into public.job_runs (job, finished_at, status, error)
  values ('due_reminders', clock_timestamp(), 'failed', sqlerrm);
  return 0;
end;
$$;

-- Creates task instances for recurrence rules whose occurrence date has come.
-- Missed occurrences older than 7 days are skipped rather than back-filled.
create or replace function public.run_recurrences(p_now timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run     bigint;
  v_today   date := (p_now at time zone 'Asia/Bangkok')::date;
  v_rule    public.task_recurrence_rules;
  v_tpl     public.tasks;
  v_task    uuid;
  v_created integer := 0;
  v_guard   integer;
begin
  insert into public.job_runs (job) values ('recurrences') returning id into v_run;

  for v_rule in
    select * from public.task_recurrence_rules
    where active and next_run_on is not null and next_run_on <= v_today
    for update skip locked
  loop
    select * into v_tpl from public.tasks where id = v_rule.template_task_id;
    v_guard := 0;
    while v_rule.next_run_on is not null and v_rule.next_run_on <= v_today and v_guard < 400 loop
      v_guard := v_guard + 1;
      exit when v_rule.until_on is not null and v_rule.next_run_on > v_rule.until_on;
      if v_rule.next_run_on >= v_today - 7 then
        insert into public.tasks (
          org_id, team_id, project_id, category_id, title, description, priority, is_urgent, is_private,
          size, estimated_hours, due_at, created_by, reminder_days, recurrence_rule_id, recurrence_on
        ) values (
          v_tpl.org_id, v_tpl.team_id, v_tpl.project_id, v_tpl.category_id, v_tpl.title, v_tpl.description,
          v_tpl.priority, v_tpl.is_urgent, v_tpl.is_private, v_tpl.size, v_tpl.estimated_hours,
          (v_rule.next_run_on + v_rule.due_time) at time zone 'Asia/Bangkok',
          v_rule.created_by, v_tpl.reminder_days, v_rule.id, v_rule.next_run_on
        )
        on conflict (recurrence_rule_id, recurrence_on) where recurrence_rule_id is not null do nothing
        returning id into v_task;

        if v_task is not null then
          insert into public.task_assignees (task_id, org_id, user_id, is_primary, assigned_by)
          select v_task, v_tpl.org_id, a.user_id, a.is_primary, v_rule.created_by
          from public.task_assignees a join public.profiles p on p.id = a.user_id and p.is_active
          where a.task_id = v_tpl.id;
          insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
          values (v_tpl.org_id, v_task, null, 'created_from_recurrence',
                  jsonb_build_object('rule_id', v_rule.id, 'occurrence', v_rule.next_run_on, 'template', v_tpl.id));
          insert into public.notifications (org_id, user_id, kind, payload, task_id, actor_id)
          select v_tpl.org_id, a.user_id, 'task_assigned',
                 jsonb_build_object('task_title', v_tpl.title, 'actor_name', private.actor_name(v_rule.created_by)),
                 v_task, v_rule.created_by
          from public.task_assignees a where a.task_id = v_task;
          v_created := v_created + 1;
          v_task := null;
        end if;
      end if;
      v_rule.next_run_on := private.next_occurrence(v_rule, v_rule.next_run_on);
    end loop;
    update public.task_recurrence_rules
    set next_run_on = case when until_on is not null and v_rule.next_run_on > until_on then null else v_rule.next_run_on end
    where id = v_rule.id;
  end loop;

  update public.job_runs set finished_at = clock_timestamp(), status = 'succeeded', affected = v_created where id = v_run;
  return v_created;
exception when others then
  insert into public.job_runs (job, finished_at, status, error)
  values ('recurrences', clock_timestamp(), 'failed', sqlerrm);
  return 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS + grants
-- -----------------------------------------------------------------------------
alter table public.company_holidays      enable row level security;
alter table public.task_change_requests  enable row level security;
alter table public.task_comments         enable row level security;
alter table public.task_recurrence_rules enable row level security;

create policy holidays_select on public.company_holidays for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy holidays_admin_insert on public.company_holidays for insert to authenticated
  with check (org_id = (select private.my_org_id()) and (select private.is_admin()));
create policy holidays_admin_delete on public.company_holidays for delete to authenticated
  using (org_id = (select private.my_org_id()) and (select private.is_admin()));
create policy change_requests_select on public.task_change_requests for select to authenticated
  using (private.can_view_task(task_id));
create policy comments_select on public.task_comments for select to authenticated
  using (private.can_view_task(task_id));
create policy recurrence_select on public.task_recurrence_rules for select to authenticated
  using (private.can_view_task(template_task_id));

grant select on public.company_holidays, public.task_change_requests, public.task_comments,
  public.task_recurrence_rules to authenticated;
grant insert, delete on public.company_holidays to authenticated;
grant all on public.company_holidays, public.task_change_requests, public.task_comments,
  public.task_recurrence_rules to service_role;

grant execute on all functions in schema private to authenticated, service_role;
-- New functions are executable by PUBLIC by default (a per-schema default
-- privilege cannot revoke that), so close them explicitly and globally.
alter default privileges revoke execute on functions from public;
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.run_due_reminders(timestamptz), public.run_recurrences(timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.task_directory(uuid),
  public.request_due_change(uuid, timestamptz, text),
  public.decide_due_change(uuid, boolean, text),
  public.is_task_reviewer(uuid),
  public.update_task_details(uuid, timestamptz, boolean, public.task_priority, public.task_size, numeric, smallint),
  public.add_task_comment(uuid, text, uuid[]),
  public.set_task_recurrence(uuid, public.recurrence_freq, smallint, smallint[], smallint, time, date),
  public.stop_task_recurrence(uuid),
  public.suggest_assignees(uuid, public.task_size, numeric, timestamptz, uuid)
to authenticated;
grant execute on all functions in schema public to service_role;

-- Realtime signals for the new tables; schedules for the new jobs.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'private' and p.proname = 'signal_org_change') then
    execute 'create trigger task_comments_signal after insert on public.task_comments for each row execute function private.signal_org_change(''tasks'')';
    execute 'create trigger task_change_requests_signal after insert or update on public.task_change_requests for each row execute function private.signal_org_change(''tasks'')';
    execute 'create trigger company_holidays_signal after insert or delete on public.company_holidays for each row execute function private.signal_org_change(''absences'')';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 08:00 and 06:30 Bangkok time (cron runs in UTC). Both jobs are retry-safe.
    execute $c$ select cron.schedule('due-reminders', '0 1 * * *', 'select public.run_due_reminders()') $c$;
    execute $c$ select cron.schedule('recurrences', '30 23 * * *', 'select public.run_recurrences()') $c$;
  end if;
end;
$$;
