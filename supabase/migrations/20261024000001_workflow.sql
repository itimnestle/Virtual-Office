-- =============================================================================
-- Milestone B — first end-to-end workflow
-- Meeting → Unassigned Inbox → assign → work → submit → review → archive,
-- unassigned-item reminders (idempotent), realtime change signals.
-- =============================================================================

create type public.review_level as enum ('manager', 'director');
create type public.review_decision as enum ('approved', 'revision_required');

-- -----------------------------------------------------------------------------
-- Submissions, reviews, attachments
-- -----------------------------------------------------------------------------
create table public.task_submissions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  task_id       uuid not null,
  submitted_by  uuid not null,
  note          text check (char_length(note) <= 5000),
  -- Who must review: Member work → Manager; Manager-owned work → Director.
  review_level  public.review_level not null,
  created_at    timestamptz not null default now(),
  unique (id, org_id),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete restrict,
  foreign key (submitted_by, org_id) references public.profiles (id, org_id) on delete restrict
);
create index task_submissions_task_idx on public.task_submissions (task_id, created_at desc);

create table public.task_reviews (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  task_id        uuid not null,
  submission_id  uuid not null,
  reviewer_id    uuid not null,
  decision       public.review_decision not null,
  comment        text check (char_length(comment) <= 5000),
  created_at     timestamptz not null default now(),
  -- One decision per submission: a retried/concurrent approve cannot double-apply.
  unique (submission_id),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete restrict,
  foreign key (submission_id, org_id) references public.task_submissions (id, org_id) on delete restrict,
  foreign key (reviewer_id, org_id) references public.profiles (id, org_id) on delete restrict
);
create index task_reviews_task_idx on public.task_reviews (task_id, created_at desc);

create table public.task_attachments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  task_id        uuid not null,
  submission_id  uuid,
  storage_path   text not null unique,
  file_name      text not null check (char_length(file_name) between 1 and 255),
  mime_type      text check (char_length(mime_type) <= 255),
  size_bytes     bigint check (size_bytes >= 0),
  uploaded_by    uuid not null,
  created_at     timestamptz not null default now(),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete restrict,
  foreign key (submission_id, org_id) references public.task_submissions (id, org_id) on delete restrict,
  foreign key (uploaded_by, org_id) references public.profiles (id, org_id) on delete restrict
);
create index task_attachments_task_idx on public.task_attachments (task_id, created_at desc);

create trigger task_submissions_append_only before update or delete on public.task_submissions
  for each row execute function private.block_mutation();
create trigger task_reviews_append_only before update or delete on public.task_reviews
  for each row execute function private.block_mutation();
create trigger task_attachments_append_only before update or delete on public.task_attachments
  for each row execute function private.block_mutation();

-- Scheduled job bookkeeping (observability for reminders and, later, purges).
create table public.job_runs (
  id           bigint generated always as identity primary key,
  job          text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  affected     integer,
  error        text
);
create index job_runs_job_idx on public.job_runs (job, started_at desc);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.actor_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.nickname, p.full_name) from public.profiles p where p.id = p_user;
$$;

create or replace function private.is_assignee(p_task_id uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.task_assignees a where a.task_id = p_task_id and a.user_id = p_user);
$$;

-- Manager-owned work (any Manager/Director among the assignees) goes to the Director.
create or replace function private.review_level_for(p_task_id uuid)
returns public.review_level
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.task_assignees a join public.profiles p on p.id = a.user_id
    where a.task_id = p_task_id and p.role in ('manager', 'director')
  ) then 'director'::public.review_level else 'manager'::public.review_level end;
$$;

-- Active people who review at a level for a task. Member work goes to the
-- team's active Managers; if the team has none, it falls back to the Director.
create or replace function private.reviewers_for(p_task_id uuid, p_level public.review_level)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_org  uuid;
begin
  select t.team_id, t.org_id into v_team, v_org from public.tasks t where t.id = p_task_id;
  if p_level = 'manager' then
    return query
      select tm.user_id from public.team_members tm
      join public.profiles p on p.id = tm.user_id and p.is_active and p.role = 'manager'
      where tm.team_id = v_team and tm.is_lead;
    if found then
      return;
    end if;
  end if;
  return query
    select p.id from public.profiles p
    where p.org_id = v_org and p.is_active and p.role = 'director';
end;
$$;

create or replace function private.notify(
  p_org uuid, p_users uuid[], p_kind text, p_payload jsonb,
  p_task uuid default null, p_meeting uuid default null, p_actor uuid default auth.uid()
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (org_id, user_id, kind, payload, task_id, meeting_id, actor_id)
  select distinct p_org, u, p_kind, p_payload, p_task, p_meeting, p_actor
  from unnest(p_users) u
  where u is not null and u is distinct from p_actor;
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Meetings
-- -----------------------------------------------------------------------------
create or replace function public.create_meeting(
  p_team_id       uuid,
  p_title         text,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_summary       text default null,
  p_attendee_ids  uuid[] default '{}',
  p_proxy_ids     uuid[] default '{}',
  p_action_items  text[] default '{}'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid := private.my_org_id();
  v_id  uuid;
begin
  if v_org is null or not private.leads_team(p_team_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'title_required' using errcode = '22023';
  end if;
  if p_ends_at is null or p_starts_at is null or p_ends_at < p_starts_at then
    raise exception 'invalid_meeting_time' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_attendee_ids, '{}') || coalesce(p_proxy_ids, '{}')) a(uid)
    where not exists (select 1 from public.profiles p where p.id = a.uid and p.org_id = v_org and p.is_active)
  ) then
    raise exception 'attendee_not_found' using errcode = '22023';
  end if;

  insert into public.meetings (org_id, team_id, title, starts_at, ends_at, summary, created_by)
  values (v_org, p_team_id, btrim(p_title), p_starts_at, p_ends_at, nullif(btrim(p_summary), ''), v_uid)
  returning id into v_id;

  insert into public.meeting_attendees (meeting_id, org_id, user_id, is_proxy)
  select v_id, v_org, a.uid, a.uid = any (coalesce(p_proxy_ids, '{}'))
  from (select distinct x as uid from unnest(coalesce(p_attendee_ids, '{}') || coalesce(p_proxy_ids, '{}') || array[v_uid]) x) a;

  insert into public.meeting_action_items (org_id, meeting_id, title, created_by)
  select v_org, v_id, btrim(i), v_uid
  from unnest(coalesce(p_action_items, '{}')) i
  where char_length(btrim(i)) > 0;

  return v_id;
end;
$$;

-- Leads, or a member who attended as proxy, can add notes and action items.
-- Proxies cannot assign: items stay in the Unassigned Inbox for the leads.
create or replace function public.add_meeting_notes(
  p_meeting_id   uuid,
  p_note         text default null,
  p_action_items text[] default '{}'
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_m     public.meetings;
  v_added integer;
begin
  select * into v_m from public.meetings where id = p_meeting_id and org_id = private.my_org_id() for update;
  if not found then
    raise exception 'meeting_not_found' using errcode = 'P0002';
  end if;
  if not (
    private.leads_team(v_m.team_id)
    or exists (select 1 from public.meeting_attendees a where a.meeting_id = v_m.id and a.user_id = v_uid and a.is_proxy)
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_note is not null and char_length(btrim(p_note)) > 0 then
    update public.meetings
    set summary = concat_ws(E'\n\n', summary, '— ' || private.actor_name(v_uid) || ': ' || btrim(p_note))
    where id = v_m.id;
  end if;

  insert into public.meeting_action_items (org_id, meeting_id, title, created_by)
  select v_m.org_id, v_m.id, btrim(i), v_uid
  from unnest(coalesce(p_action_items, '{}')) i
  where char_length(btrim(i)) > 0;
  get diagnostics v_added = row_count;

  if not private.leads_team(v_m.team_id) then
    perform private.notify(
      v_m.org_id,
      array(select tm.user_id from public.team_members tm where tm.team_id = v_m.team_id and tm.is_lead),
      'meeting_notes_added',
      jsonb_build_object('meeting_title', v_m.title, 'actor_name', private.actor_name(v_uid), 'items', v_added),
      null, v_m.id
    );
  end if;
  return v_added;
end;
$$;

-- Turn an action item into a real task (atomic, single assignment even under
-- concurrent clicks). All task rules of create_task() apply unchanged.
create or replace function public.assign_action_item(
  p_item_id          uuid,
  p_assignee_ids     uuid[],
  p_primary_ids      uuid[] default null,
  p_title            text default null,
  p_description      text default null,
  p_priority         public.task_priority default 'medium',
  p_is_urgent        boolean default false,
  p_is_private       boolean default false,
  p_due_at           timestamptz default null,
  p_size             public.task_size default null,
  p_estimated_hours  numeric default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.meeting_action_items;
  v_team uuid;
  v_task uuid;
begin
  select * into v_item from public.meeting_action_items
  where id = p_item_id and org_id = private.my_org_id()
  for update;
  if not found then
    raise exception 'action_item_not_found' using errcode = 'P0002';
  end if;
  select m.team_id into v_team from public.meetings m where m.id = v_item.meeting_id;
  if not private.leads_team(v_team) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_item.status <> 'unassigned' then
    raise exception 'action_item_already_handled' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_assignee_ids), 0) = 0 then
    raise exception 'assignee_required' using errcode = '22023';
  end if;

  v_task := public.create_task(
    p_team_id => v_team,
    p_title => coalesce(nullif(btrim(p_title), ''), v_item.title),
    p_description => coalesce(nullif(btrim(p_description), ''), v_item.description),
    p_assignee_ids => p_assignee_ids,
    p_primary_ids => p_primary_ids,
    p_priority => p_priority,
    p_is_urgent => p_is_urgent,
    p_is_private => p_is_private,
    p_due_at => p_due_at,
    p_size => p_size,
    p_estimated_hours => p_estimated_hours
  );

  update public.tasks set source_action_item_id = v_item.id where id = v_task;
  update public.meeting_action_items
  set status = 'assigned', task_id = v_task, assigned_by = auth.uid(), assigned_at = now()
  where id = v_item.id;

  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_item.org_id, v_task, auth.uid(), 'assigned_from_meeting',
          jsonb_build_object('meeting_id', v_item.meeting_id, 'action_item_id', v_item.id));
  return v_task;
end;
$$;

create or replace function public.dismiss_action_item(p_item_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.meeting_action_items;
begin
  select i.* into v_item from public.meeting_action_items i
  where i.id = p_item_id and i.org_id = private.my_org_id()
  for update;
  if not found or not private.leads_team((select m.team_id from public.meetings m where m.id = v_item.meeting_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_item.status <> 'unassigned' then
    raise exception 'action_item_already_handled' using errcode = '22023';
  end if;
  update public.meeting_action_items
  set status = 'dismissed', assigned_by = auth.uid(), assigned_at = now()
  where id = v_item.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Task lifecycle
-- -----------------------------------------------------------------------------

-- Work-state changes by assignees (and the team's leads). in_review / completed
-- are reachable only through submit_task / review_task; archived tasks never change.
create or replace function public.update_task_status(p_task_id uuid, p_status public.task_status, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t       public.tasks;
  v_lead    boolean;
  v_allowed public.task_status[];
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id() for update;
  if not found or not private.can_view_task(p_task_id) then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  if v_t.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  v_lead := private.leads_team(v_t.team_id);
  if not (private.is_assignee(p_task_id) or v_lead) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_allowed := case v_t.status
    when 'not_started'       then '{in_progress,blocked,paused}'
    when 'in_progress'       then '{blocked,paused}'
    when 'blocked'           then '{in_progress,paused}'
    when 'paused'            then '{in_progress,blocked}'
    when 'revision_required' then '{in_progress,blocked,paused}'
    else '{}'
  end::public.task_status[];
  -- Leads may also cancel any task that is not under review or completed.
  if v_lead and v_t.status not in ('in_review', 'completed', 'cancelled') then
    v_allowed := v_allowed || 'cancelled'::public.task_status;
  end if;
  if not (p_status = any (v_allowed)) then
    raise exception 'invalid_transition' using errcode = '22023',
      detail = format('%s -> %s', v_t.status, p_status);
  end if;

  update public.tasks set status = p_status where id = p_task_id;
  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_t.org_id, p_task_id, auth.uid(), 'status_changed',
          jsonb_build_object('from', v_t.status, 'to', p_status, 'note', nullif(btrim(p_note), '')));
end;
$$;

-- An assignee submits work for review with a note and/or uploaded files.
-- p_attachments: [{"path": "...", "name": "...", "size": 123, "mime": "..."}]
-- Files must already be uploaded under task-files/{org}/{task}/ by the caller.
create or replace function public.submit_task(p_task_id uuid, p_note text default null, p_attachments jsonb default '[]')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_t      public.tasks;
  v_level  public.review_level;
  v_sub    uuid;
  v_att    jsonb;
  v_prefix text;
  v_exists boolean;
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id() for update;
  if not found or not private.can_view_task(p_task_id) then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  if v_t.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  if not private.is_assignee(p_task_id, v_uid) then
    raise exception 'only_assignees_can_submit' using errcode = '42501';
  end if;
  if v_t.status not in ('not_started', 'in_progress', 'revision_required', 'blocked', 'paused') then
    raise exception 'invalid_transition' using errcode = '22023', detail = format('%s -> in_review', v_t.status);
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]')) <> 'array' or jsonb_array_length(coalesce(p_attachments, '[]')) > 10 then
    raise exception 'invalid_attachments' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_note)), 0) = 0 and jsonb_array_length(coalesce(p_attachments, '[]')) = 0 then
    raise exception 'submission_requires_note_or_file' using errcode = '22023';
  end if;

  v_level := private.review_level_for(p_task_id);
  insert into public.task_submissions (org_id, task_id, submitted_by, note, review_level)
  values (v_t.org_id, p_task_id, v_uid, nullif(btrim(p_note), ''), v_level)
  returning id into v_sub;

  v_prefix := v_t.org_id::text || '/' || v_t.id::text || '/';
  for v_att in select * from jsonb_array_elements(coalesce(p_attachments, '[]')) loop
    if coalesce(v_att ->> 'path', '') not like v_prefix || '%' or (v_att ->> 'path') like '%..%' then
      raise exception 'invalid_attachment_path' using errcode = '22023';
    end if;
    -- The object must really exist in Storage (when Storage is present).
    if to_regclass('storage.objects') is not null then
      execute 'select exists (select 1 from storage.objects where bucket_id = ''task-files'' and name = $1)'
        into v_exists using v_att ->> 'path';
      if not v_exists then
        raise exception 'attachment_not_uploaded' using errcode = '22023';
      end if;
    end if;
    insert into public.task_attachments (org_id, task_id, submission_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    values (v_t.org_id, p_task_id, v_sub, v_att ->> 'path',
            left(coalesce(nullif(v_att ->> 'name', ''), 'file'), 255),
            left(v_att ->> 'mime', 255), nullif(v_att ->> 'size', '')::bigint, v_uid);
  end loop;

  update public.tasks set status = 'in_review' where id = p_task_id;
  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_t.org_id, p_task_id, v_uid, 'submitted',
          jsonb_build_object('submission_id', v_sub, 'review_level', v_level,
                             'files', jsonb_array_length(coalesce(p_attachments, '[]'))));

  perform private.notify(
    v_t.org_id, array(select private.reviewers_for(p_task_id, v_level)), 'task_submitted',
    jsonb_build_object('task_title', v_t.title, 'actor_name', private.actor_name(v_uid)), p_task_id
  );
  return v_sub;
end;
$$;

create or replace function private.can_review(p_task_id uuid, p_level public.review_level)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() in (select private.reviewers_for(p_task_id, p_level))
     and private.my_org_id() is not null;
$$;
grant execute on function private.can_review(uuid, public.review_level) to authenticated;

-- UI helper: may the caller review this task right now? (Same rule review_task enforces.)
create or replace function public.can_review_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.can_review(t.id, s.review_level)
    from public.tasks t
    join lateral (
      select review_level from public.task_submissions where task_id = t.id order by created_at desc limit 1
    ) s on true
    where t.id = p_task_id and t.status = 'in_review' and t.archived_at is null
      and t.org_id = private.my_org_id()
  ), false);
$$;

-- Approve (→ completed + archived, read-only) or request revision.
create or replace function public.review_task(p_task_id uuid, p_decision public.review_decision, p_comment text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t   public.tasks;
  v_sub public.task_submissions;
begin
  -- Row lock serializes concurrent reviewers; the second one sees the new status.
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id() for update;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  if v_t.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  if v_t.status <> 'in_review' then
    raise exception 'task_not_in_review' using errcode = '22023';
  end if;
  select * into v_sub from public.task_submissions where task_id = p_task_id order by created_at desc limit 1;
  if not private.can_review(p_task_id, v_sub.review_level) then
    raise exception 'not_reviewer' using errcode = '42501';
  end if;
  if p_decision = 'revision_required' and coalesce(char_length(btrim(p_comment)), 0) = 0 then
    raise exception 'revision_requires_comment' using errcode = '22023';
  end if;

  insert into public.task_reviews (org_id, task_id, submission_id, reviewer_id, decision, comment)
  values (v_t.org_id, p_task_id, v_sub.id, v_uid, p_decision, nullif(btrim(p_comment), ''));
  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_t.org_id, p_task_id, v_uid,
          case when p_decision = 'approved' then 'approved_and_archived' else 'revision_requested' end,
          jsonb_build_object('submission_id', v_sub.id, 'comment', nullif(btrim(p_comment), '')));
  perform private.notify(
    v_t.org_id, array(select a.user_id from public.task_assignees a where a.task_id = p_task_id),
    case when p_decision = 'approved' then 'task_approved' else 'task_revision_requested' end,
    jsonb_build_object('task_title', v_t.title, 'actor_name', private.actor_name(v_uid)), p_task_id
  );

  if p_decision = 'approved' then
    update public.tasks
    set status = 'completed', completed_at = now(), archived_at = now(), archived_by = v_uid
    where id = p_task_id;
  else
    update public.tasks set status = 'revision_required' where id = p_task_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Unassigned meeting item reminders: every 24h from meeting end until all
-- items are handled. dedupe_key makes every cycle send at most once per person,
-- however often (or concurrently) the job runs.
-- -----------------------------------------------------------------------------
create or replace function public.run_unassigned_meeting_reminders(p_now timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run  bigint;
  v_sent integer := 0;
begin
  insert into public.job_runs (job) values ('unassigned_meeting_reminders') returning id into v_run;

  with due as (
    select m.id as meeting_id, m.org_id, m.team_id, m.title, m.created_by,
           floor(extract(epoch from (p_now - m.ends_at)) / 86400)::int as cycle,
           count(i.id)::int as remaining
    from public.meetings m
    join public.meeting_action_items i on i.meeting_id = m.id and i.status = 'unassigned'
    where m.ends_at <= p_now - interval '24 hours'
    group by m.id
  ), recipients as (
    select d.*, r.user_id
    from due d
    cross join lateral (
      select tm.user_id from public.team_members tm
      join public.profiles p on p.id = tm.user_id and p.is_active
      where tm.team_id = d.team_id and tm.is_lead
      union
      select p.id from public.profiles p
      where p.id = d.created_by and p.is_active and p.role in ('manager', 'director', 'admin')
    ) r
  ), inserted as (
    insert into public.notifications (org_id, user_id, kind, payload, meeting_id, dedupe_key)
    select org_id, user_id, 'meeting_unassigned_reminder',
           jsonb_build_object('meeting_title', title, 'remaining', remaining, 'cycle', cycle),
           meeting_id, format('meeting_unassigned:%s:cycle:%s', meeting_id, cycle)
    from recipients
    on conflict (user_id, dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_sent from inserted;

  update public.job_runs set finished_at = clock_timestamp(), status = 'succeeded', affected = v_sent where id = v_run;
  return v_sent;
exception when others then
  -- The job_runs insert above is rolled back with the failure; record it separately.
  insert into public.job_runs (job, finished_at, status, error)
  values ('unassigned_meeting_reminders', clock_timestamp(), 'failed', sqlerrm);
  return 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS + grants
-- -----------------------------------------------------------------------------
alter table public.task_submissions enable row level security;
alter table public.task_reviews     enable row level security;
alter table public.task_attachments enable row level security;
alter table public.job_runs         enable row level security;

create policy task_submissions_select on public.task_submissions for select to authenticated
  using (private.can_view_task(task_id));
create policy task_reviews_select on public.task_reviews for select to authenticated
  using (private.can_view_task(task_id));
create policy task_attachments_select on public.task_attachments for select to authenticated
  using (private.can_view_task(task_id));
create policy job_runs_admin_select on public.job_runs for select to authenticated
  using ((select private.is_admin()));

grant select on public.task_submissions, public.task_reviews, public.task_attachments, public.job_runs to authenticated;
grant all on public.task_submissions, public.task_reviews, public.task_attachments, public.job_runs to service_role;
grant all on all sequences in schema public to service_role;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.task_directory(uuid),
  public.absence_calendar(date, date),
  public.create_task(uuid, text, text, uuid[], uuid[], public.task_priority, boolean, boolean,
                     timestamptz, public.task_size, numeric, uuid, uuid, uuid),
  public.admin_set_user_active(uuid, boolean),
  public.admin_set_user_role(uuid, public.app_role),
  public.admin_set_team_membership(uuid, uuid, boolean, boolean),
  public.admin_create_invite(text, text, public.app_role, uuid, text, timestamptz),
  public.admin_revoke_invite(uuid),
  public.mark_notifications_read(uuid[]),
  public.create_meeting(uuid, text, timestamptz, timestamptz, text, uuid[], uuid[], text[]),
  public.add_meeting_notes(uuid, text, text[]),
  public.assign_action_item(uuid, uuid[], uuid[], text, text, public.task_priority, boolean, boolean,
                            timestamptz, public.task_size, numeric),
  public.dismiss_action_item(uuid),
  public.update_task_status(uuid, public.task_status, text),
  public.submit_task(uuid, text, jsonb),
  public.review_task(uuid, public.review_decision, text),
  public.can_review_task(uuid)
to authenticated;
-- The reminder job is for the scheduler / service role only.
grant execute on all functions in schema public to service_role;

-- -----------------------------------------------------------------------------
-- Supabase-only pieces (skipped where the schemas/extensions are absent).
-- -----------------------------------------------------------------------------
do $$
begin
  -- Upload types allowed for task files: Office, PDF, images, video, ZIP, text.
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    update storage.buckets
    set allowed_mime_types = array[
      'application/pdf', 'application/zip', 'application/x-zip-compressed', 'text/plain', 'text/csv',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic',
      'video/mp4', 'video/quicktime', 'video/webm'
    ]
    where id = 'task-files';
  end if;

  -- Realtime: content-free change signals on private channels.
  --   org:{org_id}   → "something in tasks/meetings changed" (no ids, no titles)
  --   user:{user_id} → "you have a new notification"
  -- Clients re-fetch through RLS, so nothing confidential travels over the socket.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'realtime' and p.proname = 'send') then
    execute $f$
      create or replace function private.signal_org_change()
      returns trigger
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        v_org uuid := coalesce(new.org_id, old.org_id);
      begin
        perform realtime.send(jsonb_build_object('entity', tg_argv[0]), 'changed', 'org:' || v_org::text, true);
        return null;
      end;
      $body$
    $f$;
    execute $f$
      create or replace function private.signal_user_notification()
      returns trigger
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      begin
        perform realtime.send(jsonb_build_object('entity', 'notifications'), 'changed', 'user:' || new.user_id::text, true);
        return null;
      end;
      $body$
    $f$;
    execute 'create trigger tasks_signal after insert or update on public.tasks for each row execute function private.signal_org_change(''tasks'')';
    execute 'create trigger task_assignees_signal after insert or delete on public.task_assignees for each row execute function private.signal_org_change(''tasks'')';
    execute 'create trigger meetings_signal after insert or update on public.meetings for each row execute function private.signal_org_change(''meetings'')';
    execute 'create trigger meeting_items_signal after insert or update on public.meeting_action_items for each row execute function private.signal_org_change(''meetings'')';
    execute 'create trigger absences_signal after insert or update or delete on public.member_absences for each row execute function private.signal_org_change(''absences'')';
    execute 'create trigger notifications_signal after insert on public.notifications for each row execute function private.signal_user_notification()';

    execute $p$
      create policy org_and_user_signals on realtime.messages for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (
          realtime.topic() = 'org:' || (select private.my_org_id())::text
          or (realtime.topic() = 'user:' || (select auth.uid())::text and (select private.my_org_id()) is not null)
        )
      )
    $p$;
  end if;

  -- Scheduler: hourly run; the dedupe key keeps it to one reminder per 24h cycle.
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $c$ select cron.schedule('unassigned-meeting-reminders', '5 * * * *',
                                     'select public.run_unassigned_meeting_reminders()') $c$;
  end if;
end;
$$;
