-- =============================================================================
-- Milestone C (completion) — file versions, checklists, tags, Admin config,
-- private-aware search.
--   * File versions: same task + same file name (case-insensitive) = a new
--     version. Everyone who can open the task sees the LATEST version only;
--     older versions are Admin-only — in the table AND in Storage.
--   * Checklists and tags are part of a task's detail (never shown for
--     redacted private tasks). No percent-progress is stored or derived.
--   * Teams, categories and tags are Admin-managed through RLS.
--   * search_tasks() matches descriptions only on tasks the caller can open.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Who may edit a task's working data (files, checklist, tags):
-- assignees, the creator, and the team's leads (Director/Admin included).
-- -----------------------------------------------------------------------------
create or replace function private.can_edit_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_task(p_task_id) and exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (
        t.created_by = auth.uid()
        or private.is_assignee(t.id)
        or private.leads_team(t.team_id)
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- File versions
-- -----------------------------------------------------------------------------
alter table public.task_attachments
  add column file_key text,
  add column version integer;

alter table public.task_attachments disable trigger task_attachments_append_only;
update public.task_attachments a
set file_key = lower(btrim(a.file_name)),
    version = v.n
from (
  select id, row_number() over (partition by task_id, lower(btrim(file_name)) order by created_at, id) as n
  from public.task_attachments
) v
where v.id = a.id;
alter table public.task_attachments enable trigger task_attachments_append_only;

alter table public.task_attachments
  alter column file_key set not null,
  alter column version set not null,
  add constraint task_attachments_version_key unique (task_id, file_key, version);

create or replace function private.version_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.file_key := lower(btrim(new.file_name));
  new.version := coalesce((
    select max(a.version) from public.task_attachments a
    where a.task_id = new.task_id and a.file_key = new.file_key
  ), 0) + 1;
  return new;
end;
$$;
create trigger task_attachments_version before insert on public.task_attachments
  for each row execute function private.version_attachment();
create trigger task_attachments_archive_guard before insert on public.task_attachments
  for each row execute function private.block_child_of_archived_task();

create or replace function private.attachment_is_latest(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.task_attachments a
    join public.task_attachments newer
      on newer.task_id = a.task_id and newer.file_key = a.file_key and newer.version > a.version
    where a.id = p_id
  );
$$;

-- Storage objects that belong to an older version are Admin-only.
create or replace function private.storage_object_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or not exists (
    select 1 from public.task_attachments a
    where a.storage_path = p_name and not private.attachment_is_latest(a.id)
  );
$$;

drop policy task_attachments_select on public.task_attachments;
create policy task_attachments_select on public.task_attachments for select to authenticated
  using (private.can_view_task(task_id) and (private.is_admin() or private.attachment_is_latest(id)));

-- Working files added to a task outside a submission (a new upload with the
-- same name becomes the next version).
create or replace function public.add_task_files(p_task_id uuid, p_attachments jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_t      public.tasks;
  v_att    jsonb;
  v_prefix text;
  v_exists boolean;
  v_n      integer := 0;
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id() for update;
  if not found or not private.can_view_task(p_task_id) then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  if v_t.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  if not private.can_edit_task(p_task_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]')) <> 'array'
     or jsonb_array_length(coalesce(p_attachments, '[]')) not between 1 and 10 then
    raise exception 'invalid_attachments' using errcode = '22023';
  end if;

  v_prefix := v_t.org_id::text || '/' || v_t.id::text || '/';
  for v_att in select * from jsonb_array_elements(p_attachments) loop
    if coalesce(v_att ->> 'path', '') not like v_prefix || '%' or (v_att ->> 'path') like '%..%' then
      raise exception 'invalid_attachment_path' using errcode = '22023';
    end if;
    if to_regclass('storage.objects') is not null then
      execute 'select exists (select 1 from storage.objects where bucket_id = ''task-files'' and name = $1)'
        into v_exists using v_att ->> 'path';
      if not v_exists then
        raise exception 'attachment_not_uploaded' using errcode = '22023';
      end if;
    end if;
    insert into public.task_attachments (org_id, task_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    values (v_t.org_id, p_task_id, v_att ->> 'path',
            left(coalesce(nullif(v_att ->> 'name', ''), 'file'), 255),
            left(v_att ->> 'mime', 255), nullif(v_att ->> 'size', '')::bigint, v_uid);
    v_n := v_n + 1;
  end loop;

  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_t.org_id, p_task_id, v_uid, 'files_added', jsonb_build_object('files', v_n));
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Checklists
-- -----------------------------------------------------------------------------
create table public.task_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  task_id     uuid not null,
  title       text not null check (char_length(btrim(title)) between 1 and 300),
  is_done     boolean not null default false,
  position    integer not null default 0,
  created_by  uuid not null,
  done_by     uuid,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  foreign key (created_by, org_id) references public.profiles (id, org_id) on delete restrict,
  foreign key (done_by, org_id) references public.profiles (id, org_id) on delete restrict
);
create index task_checklist_items_task_idx on public.task_checklist_items (task_id, position);
create trigger task_checklist_archive_guard before insert or update or delete on public.task_checklist_items
  for each row execute function private.block_child_of_archived_task();

create or replace function public.add_checklist_item(p_task_id uuid, p_title text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t  public.tasks;
  v_id uuid;
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id();
  if not found or not private.can_edit_task(p_task_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_title)), 0) = 0 then
    raise exception 'title_required' using errcode = '22023';
  end if;
  insert into public.task_checklist_items (org_id, task_id, title, position, created_by)
  values (v_t.org_id, p_task_id, btrim(p_title),
          coalesce((select max(position) + 1 from public.task_checklist_items where task_id = p_task_id), 0),
          auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_checklist_item_done(p_item_id uuid, p_done boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task uuid;
begin
  select task_id into v_task from public.task_checklist_items where id = p_item_id and org_id = private.my_org_id();
  if v_task is null or not private.can_edit_task(v_task) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.task_checklist_items
  set is_done = p_done,
      done_by = case when p_done then auth.uid() end,
      done_at = case when p_done then now() end
  where id = p_item_id;
end;
$$;

create or replace function public.remove_checklist_item(p_item_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_task uuid;
begin
  select task_id into v_task from public.task_checklist_items where id = p_item_id and org_id = private.my_org_id();
  if v_task is null or not private.can_edit_task(v_task) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.task_checklist_items where id = p_item_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tags (Admin-managed vocabulary) and task category
-- -----------------------------------------------------------------------------
create table public.task_tags (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  color       text not null default '#5cc2ab' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);

create table public.task_tag_links (
  task_id  uuid not null,
  tag_id   uuid not null,
  org_id   uuid not null,
  primary key (task_id, tag_id),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  foreign key (tag_id, org_id) references public.task_tags (id, org_id) on delete cascade
);
create index task_tag_links_tag_idx on public.task_tag_links (tag_id);
create trigger task_tag_links_archive_guard before insert or delete on public.task_tag_links
  for each row execute function private.block_child_of_archived_task();

create or replace function public.set_task_tags(p_task_id uuid, p_tag_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t   public.tasks;
  v_ids uuid[] := coalesce(array(select distinct x from unnest(p_tag_ids) x where x is not null), '{}');
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id() for update;
  if not found or not private.can_edit_task(p_task_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_t.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(v_ids) x
    where not exists (select 1 from public.task_tags tg where tg.id = x and tg.org_id = v_t.org_id and tg.is_active)
  ) then
    raise exception 'tag_not_found' using errcode = 'P0002';
  end if;
  delete from public.task_tag_links where task_id = p_task_id and not (tag_id = any (v_ids));
  insert into public.task_tag_links (task_id, tag_id, org_id)
  select p_task_id, x, v_t.org_id from unnest(v_ids) x
  on conflict do nothing;
  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_t.org_id, p_task_id, auth.uid(), 'tags_changed', jsonb_build_object('tags', v_ids));
end;
$$;

-- "งานระบุประเภท (แก้ไขได้โดยผู้มีสิทธิ์)": the creator or the team's leads.
create or replace function public.set_task_category(p_task_id uuid, p_category_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t public.tasks;
begin
  select * into v_t from public.tasks where id = p_task_id and org_id = private.my_org_id() for update;
  if not found or not private.can_view_task(p_task_id)
     or not (v_t.created_by = auth.uid() or private.leads_team(v_t.team_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_t.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.task_categories c where c.id = p_category_id and c.org_id = v_t.org_id and c.is_active
  ) then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  update public.tasks set category_id = p_category_id where id = p_task_id;
  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_t.org_id, p_task_id, auth.uid(), 'category_changed',
          jsonb_build_object('from', v_t.category_id, 'to', p_category_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Directory v3 (+ tag_ids) and private-aware search
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
  category_id            uuid,
  tag_ids                uuid[]
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
    case when v.ok then t.category_id end,
    case when v.ok then array(select l.tag_id from public.task_tag_links l where l.task_id = t.id) end
  from public.tasks t
  cross join lateral (select private.can_view_task(t.id) as ok) v
  where t.org_id = private.my_org_id()
    and (p_team_id is null or t.team_id = p_team_id)
    and (v.ok or (t.is_private and private.is_team_member(t.team_id)))
  order by t.created_at desc;
$$;

-- Search over the directory. Text matches the title for every row the caller
-- may list, but the description / comments / checklist ONLY for tasks the
-- caller can open. All other filters use columns that are NULL on redacted
-- rows, so a filter can never reveal anything about a private task.
create function public.search_tasks(
  p_query            text default null,
  p_statuses         public.task_status[] default null,
  p_category_id      uuid default null,
  p_tag_id           uuid default null,
  p_assignee_id      uuid default null,
  p_priority         public.task_priority default null,
  p_urgent_only      boolean default false,
  p_include_archived boolean default false
)
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
  category_id            uuid,
  tag_ids                uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    -- Escape LIKE wildcards so "%" or "_" are matched literally.
    select '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           coalesce(char_length(btrim(p_query)), 0) > 0 as active
  )
  select d.*
  from public.task_directory() d
  cross join q
  where (
      not q.active
      or d.title ilike q.pat
      or (not d.redacted and exists (
            select 1 from public.tasks t
            where t.id = d.id and (
              t.description ilike q.pat
              or exists (select 1 from public.task_comments c where c.task_id = t.id and c.body ilike q.pat)
              or exists (select 1 from public.task_checklist_items ci where ci.task_id = t.id and ci.title ilike q.pat)
            )))
    )
    and (p_statuses is null or d.status = any (p_statuses))
    and (p_category_id is null or d.category_id = p_category_id)
    and (p_tag_id is null or p_tag_id = any (d.tag_ids))
    and (p_assignee_id is null or p_assignee_id = any (d.assignee_ids))
    and (p_priority is null or d.priority = p_priority)
    and (not p_urgent_only or d.is_urgent)
    and (p_include_archived or d.archived_at is null)
  limit 300;
$$;

-- -----------------------------------------------------------------------------
-- Admin configuration through RLS (teams, categories, tags)
-- -----------------------------------------------------------------------------
alter table public.task_checklist_items enable row level security;
alter table public.task_tags            enable row level security;
alter table public.task_tag_links       enable row level security;

create policy checklist_select on public.task_checklist_items for select to authenticated
  using (private.can_view_task(task_id));
create policy tags_select on public.task_tags for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy tag_links_select on public.task_tag_links for select to authenticated
  using (private.can_view_task(task_id));

create policy tags_admin_insert on public.task_tags for insert to authenticated
  with check (org_id = (select private.my_org_id()) and (select private.is_admin()));
create policy tags_admin_update on public.task_tags for update to authenticated
  using (org_id = (select private.my_org_id()) and (select private.is_admin()))
  with check (org_id = (select private.my_org_id()) and (select private.is_admin()));
create policy categories_admin_insert on public.task_categories for insert to authenticated
  with check (org_id = (select private.my_org_id()) and (select private.is_admin()));
create policy categories_admin_update on public.task_categories for update to authenticated
  using (org_id = (select private.my_org_id()) and (select private.is_admin()))
  with check (org_id = (select private.my_org_id()) and (select private.is_admin()));
create policy teams_admin_insert on public.teams for insert to authenticated
  with check (org_id = (select private.my_org_id()) and (select private.is_admin()));
create policy teams_admin_update on public.teams for update to authenticated
  using (org_id = (select private.my_org_id()) and (select private.is_admin()))
  with check (org_id = (select private.my_org_id()) and (select private.is_admin()));

grant select on public.task_checklist_items, public.task_tags, public.task_tag_links to authenticated;
grant insert, update (name, color, is_active) on public.task_tags to authenticated;
grant insert, update (name_th, name_en, is_active, sort_order) on public.task_categories to authenticated;
grant insert, update (name) on public.teams to authenticated;
grant all on public.task_checklist_items, public.task_tags, public.task_tag_links to service_role;

grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.task_directory(uuid),
  public.search_tasks(text, public.task_status[], uuid, uuid, uuid, public.task_priority, boolean, boolean),
  public.add_task_files(uuid, jsonb),
  public.add_checklist_item(uuid, text),
  public.set_checklist_item_done(uuid, boolean),
  public.remove_checklist_item(uuid),
  public.set_task_tags(uuid, uuid[]),
  public.set_task_category(uuid, uuid)
to authenticated;
grant execute on all functions in schema public to service_role;

-- Storage: older file versions are Admin-only; realtime signals for new tables.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists task_files_select on storage.objects';
    execute $p$
      create policy task_files_select on storage.objects for select to authenticated
      using (
        bucket_id = 'task-files'
        and (storage.foldername(name))[1] = (select private.my_org_id())::text
        and private.can_view_task(private.try_uuid((storage.foldername(name))[2]))
        and private.storage_object_visible(name)
      )
    $p$;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'private' and p.proname = 'signal_org_change') then
    execute 'create trigger task_checklist_signal after insert or update or delete on public.task_checklist_items for each row execute function private.signal_org_change(''tasks'')';
    execute 'create trigger task_tag_links_signal after insert or delete on public.task_tag_links for each row execute function private.signal_org_change(''tasks'')';
    execute 'create trigger task_attachments_signal after insert on public.task_attachments for each row execute function private.signal_org_change(''tasks'')';
  end if;
end;
$$;

-- Seed vocabulary for new organizations is created by Admins; the demo seed
-- adds a few tags (supabase/seed.sql).
