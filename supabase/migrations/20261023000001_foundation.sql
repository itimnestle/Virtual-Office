-- =============================================================================
-- 3D Virtual Office — Milestone A foundation schema
-- Identity/organization, tasks (multi-assignee), meetings + action items,
-- notifications, absences, social profile (avatar/pet), audit trails.
--
-- Security model (see docs/decisions.md):
--   * Every table has RLS enabled; anon gets nothing; authenticated gets only
--     explicit grants. Business mutations go through SECURITY DEFINER RPCs that
--     re-check the caller's role, so table-level writes stay denied.
--   * Private task detail is only reachable through private.can_view_task();
--     unrelated team members get the title via public.task_directory().
--   * Timestamps are timestamptz (UTC). Business timezone is Asia/Bangkok.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Future tables/functions in public are deny-by-default for API roles.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('director', 'manager', 'member', 'admin');

create type public.task_status as enum (
  'not_started', 'in_progress', 'blocked', 'in_review',
  'revision_required', 'completed', 'paused', 'cancelled'
);

create type public.task_priority as enum ('low', 'medium', 'high');
create type public.task_size as enum ('xs', 's', 'm', 'l', 'xl');
create type public.action_item_status as enum ('unassigned', 'assigned', 'dismissed');
create type public.absence_part as enum ('full_day', 'am', 'pm');
create type public.pet_species as enum ('dog', 'cat');

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Identity & organization
-- -----------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  timezone    text not null default 'Asia/Bangkok',
  -- ISO day-of-week (1 = Monday). Default Monday–Saturday.
  work_days   smallint[] not null default '{1,2,3,4,5,6}',
  work_start  time not null default '08:00',
  work_end    time not null default '17:00',
  created_at  timestamptz not null default now()
);

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  created_at  timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);

create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete restrict,
  org_id                  uuid not null references public.organizations (id) on delete restrict,
  email                   text not null,
  full_name               text not null check (char_length(btrim(full_name)) between 1 and 120),
  nickname                text check (char_length(nickname) <= 40),
  role                    public.app_role not null,
  job_title               text check (char_length(job_title) <= 120),
  locale                  text not null default 'th' check (locale in ('th', 'en')),
  theme                   text not null default 'system' check (theme in ('system', 'light', 'dark')),
  reduce_motion           boolean not null default false,
  is_active               boolean not null default true,
  deactivated_at          timestamptz,
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, org_id),
  check (is_active or deactivated_at is not null)
);
create unique index profiles_org_email_key on public.profiles (org_id, lower(email));
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create table public.team_members (
  team_id     uuid not null,
  org_id      uuid not null,
  user_id     uuid not null,
  -- is_lead = this person manages the team (Manager). Multiple leads allowed.
  is_lead     boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete cascade,
  foreign key (user_id, org_id) references public.profiles (id, org_id) on delete restrict
);
create index team_members_user_idx on public.team_members (user_id);

create table public.skills (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name_th     text not null check (char_length(name_th) between 1 and 80),
  name_en     text not null check (char_length(name_en) between 1 and 80),
  created_at  timestamptz not null default now(),
  unique (org_id, name_en),
  unique (id, org_id)
);

create table public.member_skills (
  user_id     uuid not null,
  skill_id    uuid not null,
  org_id      uuid not null,
  level       smallint not null check (level between 1 and 5),
  updated_at  timestamptz not null default now(),
  primary key (user_id, skill_id),
  foreign key (user_id, org_id) references public.profiles (id, org_id) on delete restrict,
  foreign key (skill_id, org_id) references public.skills (id, org_id) on delete cascade
);

create table public.invites (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  email             text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name         text not null check (char_length(btrim(full_name)) between 1 and 120),
  role              public.app_role not null,
  team_id           uuid,
  -- SHA-256 hex of the one-time token; plaintext token is only shown in the invite link.
  token_hash        text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by        uuid,
  expires_at        timestamptz not null,
  accepted_at       timestamptz,
  accepted_user_id  uuid,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete set null (team_id),
  foreign key (invited_by, org_id) references public.profiles (id, org_id) on delete restrict
);
create unique index invites_pending_email_key on public.invites (org_id, lower(email))
  where accepted_at is null and revoked_at is null;

create table public.admin_audit_logs (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references public.organizations (id) on delete cascade,
  actor_id        uuid references public.profiles (id) on delete restrict,
  action          text not null,
  target_user_id  uuid references public.profiles (id) on delete restrict,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index admin_audit_logs_org_idx on public.admin_audit_logs (org_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Projects & tasks
-- -----------------------------------------------------------------------------
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete restrict,
  team_id      uuid not null,
  name         text not null check (char_length(btrim(name)) between 1 and 200),
  description  text check (char_length(description) <= 5000),
  created_by   uuid not null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (id, org_id),
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete restrict,
  foreign key (created_by, org_id) references public.profiles (id, org_id) on delete restrict
);

create table public.task_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name_th     text not null check (char_length(name_th) between 1 and 80),
  name_en     text not null check (char_length(name_en) between 1 and 80),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (org_id, name_en),
  unique (id, org_id)
);

create table public.tasks (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations (id) on delete restrict,
  team_id                uuid not null,
  project_id             uuid,
  parent_task_id         uuid,
  category_id            uuid,
  title                  text not null check (char_length(btrim(title)) between 1 and 200),
  description            text check (char_length(description) <= 20000),
  status                 public.task_status not null default 'not_started',
  priority               public.task_priority not null default 'medium',
  is_urgent              boolean not null default false,
  is_private             boolean not null default false,
  size                   public.task_size,
  estimated_hours        numeric(6, 2) check (estimated_hours >= 0 and estimated_hours <= 2000),
  due_at                 timestamptz,
  created_by             uuid not null,
  source_action_item_id  uuid,
  completed_at           timestamptz,
  archived_at            timestamptz,
  archived_by            uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, org_id),
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete restrict,
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete restrict,
  foreign key (parent_task_id, org_id) references public.tasks (id, org_id) on delete restrict,
  foreign key (category_id, org_id) references public.task_categories (id, org_id) on delete restrict,
  foreign key (created_by, org_id) references public.profiles (id, org_id) on delete restrict,
  foreign key (archived_by, org_id) references public.profiles (id, org_id) on delete restrict,
  check (parent_task_id is null or parent_task_id <> id),
  check (archived_at is null or status in ('completed', 'cancelled'))
);
create index tasks_team_idx on public.tasks (team_id, status);
create index tasks_org_due_idx on public.tasks (org_id, due_at) where archived_at is null;
create index tasks_parent_idx on public.tasks (parent_task_id) where parent_task_id is not null;
create index tasks_project_idx on public.tasks (project_id) where project_id is not null;
create trigger tasks_touch before update on public.tasks
  for each row execute function private.touch_updated_at();

create table public.task_assignees (
  task_id      uuid not null,
  org_id       uuid not null,
  user_id      uuid not null,
  -- Multiple primary co-owners are allowed on one task.
  is_primary   boolean not null default true,
  assigned_by  uuid,
  assigned_at  timestamptz not null default now(),
  primary key (task_id, user_id),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  foreign key (user_id, org_id) references public.profiles (id, org_id) on delete restrict,
  foreign key (assigned_by, org_id) references public.profiles (id, org_id) on delete restrict
);
create index task_assignees_user_idx on public.task_assignees (user_id);

create table public.task_audit_logs (
  id          bigint generated always as identity primary key,
  org_id      uuid not null,
  task_id     uuid not null,
  actor_id    uuid,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete restrict,
  foreign key (actor_id, org_id) references public.profiles (id, org_id) on delete restrict
);
create index task_audit_logs_task_idx on public.task_audit_logs (task_id, created_at);

-- Archived tasks are read-only forever; audit logs are append-only.
create or replace function private.block_archived_task_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.archived_at is not null then
      raise exception 'task_archived_immutable' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.archived_at is not null then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger tasks_archive_guard before update or delete on public.tasks
  for each row execute function private.block_archived_task_change();

create or replace function private.block_child_of_archived_task()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_task_id uuid := coalesce(new.task_id, old.task_id);
begin
  if exists (select 1 from public.tasks t where t.id = v_task_id and t.archived_at is not null) then
    raise exception 'task_archived_immutable' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger task_assignees_archive_guard before insert or update or delete on public.task_assignees
  for each row execute function private.block_child_of_archived_task();

create or replace function private.block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append_only_table' using errcode = 'P0001';
end;
$$;
create trigger task_audit_logs_append_only before update or delete on public.task_audit_logs
  for each row execute function private.block_mutation();
create trigger admin_audit_logs_append_only before update or delete on public.admin_audit_logs
  for each row execute function private.block_mutation();

-- -----------------------------------------------------------------------------
-- Meetings & action items (assignment status independent from tasks)
-- -----------------------------------------------------------------------------
create table public.meetings (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete restrict,
  team_id     uuid not null,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  summary     text check (char_length(summary) <= 50000),
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id),
  check (ends_at >= starts_at),
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete restrict,
  foreign key (created_by, org_id) references public.profiles (id, org_id) on delete restrict
);
create index meetings_team_idx on public.meetings (team_id, ends_at desc);
create trigger meetings_touch before update on public.meetings
  for each row execute function private.touch_updated_at();

create table public.meeting_attendees (
  meeting_id  uuid not null,
  org_id      uuid not null,
  user_id     uuid not null,
  -- true = attended on behalf of the lead; may add notes but cannot assign work.
  is_proxy    boolean not null default false,
  primary key (meeting_id, user_id),
  foreign key (meeting_id, org_id) references public.meetings (id, org_id) on delete cascade,
  foreign key (user_id, org_id) references public.profiles (id, org_id) on delete restrict
);

create table public.meeting_action_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  meeting_id   uuid not null,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  description  text check (char_length(description) <= 5000),
  status       public.action_item_status not null default 'unassigned',
  task_id      uuid,
  assigned_by  uuid,
  assigned_at  timestamptz,
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  unique (id, org_id),
  foreign key (meeting_id, org_id) references public.meetings (id, org_id) on delete cascade,
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete restrict,
  foreign key (assigned_by, org_id) references public.profiles (id, org_id) on delete restrict,
  foreign key (created_by, org_id) references public.profiles (id, org_id) on delete restrict,
  check ((status = 'assigned') = (task_id is not null))
);
create index meeting_action_items_unassigned_idx on public.meeting_action_items (org_id, meeting_id)
  where status = 'unassigned';

alter table public.tasks
  add constraint tasks_source_action_item_fk
  foreign key (source_action_item_id, org_id)
  references public.meeting_action_items (id, org_id) on delete restrict;

-- -----------------------------------------------------------------------------
-- Notifications (web-only in V1)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  user_id     uuid not null,
  -- kind + payload are rendered client-side in TH/EN.
  kind        text not null check (kind ~ '^[a-z_]{1,64}$'),
  payload     jsonb not null default '{}'::jsonb,
  task_id     uuid,
  meeting_id  uuid,
  actor_id    uuid,
  -- Idempotency key for scheduled reminders; unique per recipient.
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  foreign key (user_id, org_id) references public.profiles (id, org_id) on delete restrict,
  foreign key (task_id, org_id) references public.tasks (id, org_id) on delete cascade,
  foreign key (meeting_id, org_id) references public.meetings (id, org_id) on delete cascade,
  foreign key (actor_id, org_id) references public.profiles (id, org_id) on delete restrict,
  unique (user_id, dedupe_key)
);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc)
  where read_at is null;

-- -----------------------------------------------------------------------------
-- Absences (no approval). Reason is restricted; others see only the dates.
-- -----------------------------------------------------------------------------
create table public.member_absences (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  user_id     uuid not null,
  starts_on   date not null,
  ends_on     date not null,
  part        public.absence_part not null default 'full_day',
  reason      text check (char_length(reason) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (user_id, org_id) references public.profiles (id, org_id) on delete restrict,
  check (ends_on >= starts_on),
  check (part = 'full_day' or starts_on = ends_on)
);
create index member_absences_user_idx on public.member_absences (user_id, starts_on);
create index member_absences_org_range_idx on public.member_absences (org_id, starts_on, ends_on);
create trigger member_absences_touch before update on public.member_absences
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Social profile: avatar appearance & pet
-- -----------------------------------------------------------------------------
create table public.avatar_appearance (
  user_id     uuid primary key,
  org_id      uuid not null,
  skin        text not null default 'tone_3' check (char_length(skin) <= 40),
  face        text not null default 'round' check (char_length(face) <= 40),
  eyes        text not null default 'dot' check (char_length(eyes) <= 40),
  nose        text not null default 'button' check (char_length(nose) <= 40),
  mouth       text not null default 'smile' check (char_length(mouth) <= 40),
  hair        text not null default 'short' check (char_length(hair) <= 40),
  hair_color  text not null default 'black' check (char_length(hair_color) <= 40),
  top         text not null default 'tshirt' check (char_length(top) <= 40),
  bottom      text not null default 'pants' check (char_length(bottom) <= 40),
  shoes       text not null default 'sneakers' check (char_length(shoes) <= 40),
  glasses     text not null default 'none' check (char_length(glasses) <= 40),
  accessory   text not null default 'none' check (char_length(accessory) <= 40),
  updated_at  timestamptz not null default now(),
  foreign key (user_id, org_id) references public.profiles (id, org_id) on delete restrict
);
create trigger avatar_appearance_touch before update on public.avatar_appearance
  for each row execute function private.touch_updated_at();

create table public.pets (
  user_id        uuid primary key,
  org_id         uuid not null,
  species        public.pet_species not null,
  breed          text not null check (char_length(breed) <= 40),
  color          text not null check (char_length(color) <= 40),
  outfit         text not null default 'none' check (char_length(outfit) <= 40),
  name           text not null check (char_length(btrim(name)) between 1 and 40),
  sound_enabled  boolean not null default true,
  updated_at     timestamptz not null default now(),
  foreign key (user_id, org_id) references public.profiles (id, org_id) on delete restrict
);
create trigger pets_touch before update on public.pets
  for each row execute function private.touch_updated_at();

-- =============================================================================
-- Authorization helpers (SECURITY DEFINER, so they can read profiles without
-- recursive RLS). They all resolve to "no access" for inactive users.
-- =============================================================================
create or replace function private.my_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.org_id from public.profiles p where p.id = auth.uid() and p.is_active;
$$;

create or replace function private.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() = 'admin', false);
$$;

-- Director or Admin: org-wide oversight.
create or replace function private.is_org_leader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() in ('director', 'admin'), false);
$$;

-- Caller leads (manages) the team, or has org-wide oversight of its org.
create or replace function private.leads_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teams t
    where t.id = p_team_id
      and t.org_id = private.my_org_id()
      and (
        private.is_org_leader()
        or exists (
          select 1 from public.team_members tm
          where tm.team_id = t.id and tm.user_id = auth.uid() and tm.is_lead
        )
      )
  );
$$;

create or replace function private.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.leads_team(p_team_id)
      or exists (
        select 1 from public.team_members tm
        join public.profiles me on me.id = tm.user_id and me.is_active
        where tm.team_id = p_team_id and tm.user_id = auth.uid()
      );
$$;

-- Caller is the user's leader: Director/Admin of the same org, or a Manager
-- who leads any team the user belongs to.
create or replace function private.leads_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles u
    where u.id = p_user_id
      and u.org_id = private.my_org_id()
      and (
        private.is_org_leader()
        or exists (
          select 1 from public.team_members theirs
          join public.team_members mine
            on mine.team_id = theirs.team_id and mine.user_id = auth.uid() and mine.is_lead
          where theirs.user_id = u.id
        )
      )
  );
$$;

-- Full task detail access. The single source of truth for private-task secrecy:
-- creator, assignees, team leads (Manager), Director and Admin. Non-private
-- tasks are readable by every member of the task's team.
create or replace function private.can_view_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and t.org_id = private.my_org_id()
      and (
        (not t.is_private and private.is_team_member(t.team_id))
        or t.created_by = auth.uid()
        or exists (select 1 from public.task_assignees a where a.task_id = t.id and a.user_id = auth.uid())
        or private.leads_team(t.team_id)
      )
  );
$$;

create or replace function private.can_view_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = p_meeting_id
      and m.org_id = private.my_org_id()
      and (
        private.is_team_member(m.team_id)
        or exists (select 1 from public.meeting_attendees a where a.meeting_id = m.id and a.user_id = auth.uid())
      )
  );
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- =============================================================================
-- Invite-only account creation. Every auth.users row must present the plaintext
-- invite token (user_metadata.invite_token). The BEFORE trigger hashes it,
-- matches a pending invite for the same email, strips the token and records the
-- invite id; the AFTER trigger creates the profile and consumes the invite in
-- the same transaction. Works for GoTrue's admin API (which writes app_metadata
-- only after the insert) and stays safe even if public sign-up were enabled,
-- because the token itself is the secret. The first Admin is simply an invite
-- row created with the service role (invited_by = null).
-- =============================================================================
create or replace function private.validate_invite_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token  text := new.raw_user_meta_data ->> 'invite_token';
  v_invite public.invites;
begin
  if v_token is null or v_token = '' then
    raise exception 'invite_required' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.invites
  where token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
  for update;

  if not found
     or v_invite.accepted_at is not null
     or v_invite.revoked_at is not null
     or v_invite.expires_at < now() then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  if lower(v_invite.email) <> lower(new.email) then
    raise exception 'invite_email_mismatch' using errcode = 'P0001';
  end if;

  new.raw_user_meta_data := (coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite_token')
                            || jsonb_build_object('full_name', v_invite.full_name);
  -- Overwrites any caller-supplied value; only this trigger decides the invite.
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('invite_id', v_invite.id);
  return new;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
begin
  select * into v_invite
  from public.invites
  where id = private.try_uuid(new.raw_app_meta_data ->> 'invite_id')
  for update;

  if not found or v_invite.accepted_at is not null then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, org_id, email, full_name, role)
  values (new.id, v_invite.org_id, lower(new.email), v_invite.full_name, v_invite.role);

  if v_invite.team_id is not null then
    insert into public.team_members (team_id, org_id, user_id, is_lead)
    values (v_invite.team_id, v_invite.org_id, new.id, v_invite.role = 'manager');
  end if;

  update public.invites
  set accepted_at = now(), accepted_user_id = new.id
  where id = v_invite.id;

  insert into public.admin_audit_logs (org_id, actor_id, action, target_user_id, details)
  values (v_invite.org_id, null, 'invite_accepted', new.id,
          jsonb_build_object('invite_id', v_invite.id, 'role', v_invite.role));
  return new;
end;
$$;

-- A consumed token must never be written back into user metadata.
create or replace function private.strip_invite_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'invite_token' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'invite_token';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_validate_invite
  before insert on auth.users
  for each row execute function private.validate_invite_signup();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create trigger on_auth_user_strip_invite_token
  before update on auth.users
  for each row execute function private.strip_invite_token();

-- =============================================================================
-- RPCs (public API surface). All re-check the caller.
-- =============================================================================

-- Directory of tasks the caller may know about. Private tasks the caller cannot
-- open are returned with ONLY id, team_id and title; every other column is NULL.
create or replace function public.task_directory(p_team_id uuid default null)
returns table (
  id               uuid,
  team_id          uuid,
  title            text,
  is_private       boolean,
  redacted         boolean,
  status           public.task_status,
  priority         public.task_priority,
  is_urgent        boolean,
  size             public.task_size,
  estimated_hours  numeric,
  due_at           timestamptz,
  created_by       uuid,
  created_at       timestamptz,
  archived_at      timestamptz,
  assignee_ids     uuid[],
  is_new_today     boolean
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
    end
  from public.tasks t
  cross join lateral (select private.can_view_task(t.id) as ok) v
  where t.org_id = private.my_org_id()
    and (p_team_id is null or t.team_id = p_team_id)
    and (v.ok or (t.is_private and private.is_team_member(t.team_id)))
  order by t.created_at desc;
$$;

-- Absences for the calendar/3D "at home" state, WITHOUT the reason column.
create or replace function public.absence_calendar(p_from date, p_to date)
returns table (
  id         uuid,
  user_id    uuid,
  starts_on  date,
  ends_on    date,
  part       public.absence_part
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.user_id, a.starts_on, a.ends_on, a.part
  from public.member_absences a
  where a.org_id = private.my_org_id()
    and a.starts_on <= p_to
    and a.ends_on >= p_from
  order by a.starts_on;
$$;

-- Create a task with assignees, audit and notifications in one transaction.
create or replace function public.create_task(
  p_team_id          uuid,
  p_title            text,
  p_description      text default null,
  p_assignee_ids     uuid[] default null,
  p_primary_ids      uuid[] default null,
  p_priority         public.task_priority default 'medium',
  p_is_urgent        boolean default false,
  p_is_private       boolean default false,
  p_due_at           timestamptz default null,
  p_size             public.task_size default null,
  p_estimated_hours  numeric default null,
  p_category_id      uuid default null,
  p_project_id       uuid default null,
  p_parent_task_id   uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_org       uuid;
  v_role      public.app_role;
  v_actor     text;
  v_task      uuid;
  v_assignees uuid[];
  v_primary   uuid[];
begin
  select p.org_id, p.role, coalesce(p.nickname, p.full_name)
    into v_org, v_role, v_actor
  from public.profiles p where p.id = v_uid and p.is_active;
  if v_org is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.teams t where t.id = p_team_id and t.org_id = v_org) then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;
  if v_role in ('member', 'manager') and not private.is_team_member(p_team_id) then
    raise exception 'not_team_member' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'title_required' using errcode = '22023';
  end if;

  v_assignees := coalesce(array(select distinct x from unnest(p_assignee_ids) x where x is not null), '{}');
  if cardinality(v_assignees) = 0 then
    v_assignees := array[v_uid];
  end if;
  v_primary := coalesce(
    array(select distinct x from unnest(p_primary_ids) x where x = any (v_assignees)),
    '{}'
  );
  if cardinality(v_primary) = 0 then
    v_primary := v_assignees;
  end if;

  -- Assignees must be active members of the task's team.
  if exists (
    select 1 from unnest(v_assignees) a(uid)
    where not exists (
      select 1 from public.team_members tm
      join public.profiles p on p.id = tm.user_id and p.is_active
      where tm.team_id = p_team_id and tm.user_id = a.uid
    )
  ) then
    raise exception 'assignee_not_in_team' using errcode = '22023';
  end if;

  -- Role rules (Blueprint 2.1/2.2):
  --  * Member creates their own work only (starts immediately, leads notified).
  --  * Manager assigns within teams they lead.
  --  * Director assigning a Member directly is the urgent path (Manager notified).
  if v_role = 'member' then
    if v_assignees <> array[v_uid] then
      raise exception 'member_can_only_self_assign' using errcode = '42501';
    end if;
    if p_is_urgent then
      raise exception 'member_cannot_mark_urgent' using errcode = '42501';
    end if;
  elsif v_role = 'manager' then
    if not private.leads_team(p_team_id) and v_assignees <> array[v_uid] then
      raise exception 'manager_not_team_lead' using errcode = '42501';
    end if;
  elsif v_role = 'director' then
    if not p_is_urgent and exists (
      select 1 from public.profiles p where p.id = any (v_assignees) and p.role = 'member'
    ) then
      raise exception 'director_direct_assignment_requires_urgent' using errcode = '22023';
    end if;
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.task_categories c where c.id = p_category_id and c.org_id = v_org and c.is_active
  ) then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects pr where pr.id = p_project_id and pr.team_id = p_team_id and pr.archived_at is null
  ) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if p_parent_task_id is not null and not (
    private.can_view_task(p_parent_task_id)
    and exists (select 1 from public.tasks pt where pt.id = p_parent_task_id and pt.archived_at is null and pt.team_id = p_team_id)
  ) then
    raise exception 'parent_task_not_found' using errcode = 'P0002';
  end if;

  insert into public.tasks (
    org_id, team_id, project_id, parent_task_id, category_id, title, description,
    priority, is_urgent, is_private, size, estimated_hours, due_at, created_by
  ) values (
    v_org, p_team_id, p_project_id, p_parent_task_id, p_category_id, btrim(p_title), p_description,
    p_priority, p_is_urgent, p_is_private, p_size, p_estimated_hours, p_due_at, v_uid
  )
  returning id into v_task;

  insert into public.task_assignees (task_id, org_id, user_id, is_primary, assigned_by)
  select v_task, v_org, a.uid, a.uid = any (v_primary), v_uid
  from unnest(v_assignees) a(uid);

  insert into public.task_audit_logs (org_id, task_id, actor_id, action, details)
  values (v_org, v_task, v_uid, 'created', jsonb_build_object(
    'assignees', v_assignees, 'primary', v_primary, 'priority', p_priority,
    'is_urgent', p_is_urgent, 'is_private', p_is_private, 'due_at', p_due_at
  ));

  -- Assignees (except the creator) get the assignment.
  insert into public.notifications (org_id, user_id, kind, payload, task_id, actor_id)
  select v_org, a.uid,
         case when p_is_urgent then 'urgent_task_assigned' else 'task_assigned' end,
         jsonb_build_object('task_title', btrim(p_title), 'actor_name', v_actor),
         v_task, v_uid
  from unnest(v_assignees) a(uid)
  where a.uid <> v_uid;

  -- Member-created work notifies both leadership levels.
  if v_role = 'member' then
    insert into public.notifications (org_id, user_id, kind, payload, task_id, actor_id)
    select distinct v_org, p.id, 'member_created_task',
           jsonb_build_object('task_title', btrim(p_title), 'actor_name', v_actor),
           v_task, v_uid
    from public.profiles p
    where p.org_id = v_org and p.is_active and p.id <> v_uid
      and (
        p.role = 'director'
        or exists (select 1 from public.team_members tm where tm.team_id = p_team_id and tm.user_id = p.id and tm.is_lead)
      );
  end if;

  -- Urgent direct assignment by the Director notifies the team's Managers.
  if v_role = 'director' and p_is_urgent then
    insert into public.notifications (org_id, user_id, kind, payload, task_id, actor_id)
    select v_org, tm.user_id, 'urgent_direct_assignment_notice',
           jsonb_build_object('task_title', btrim(p_title), 'actor_name', v_actor),
           v_task, v_uid
    from public.team_members tm
    join public.profiles p on p.id = tm.user_id and p.is_active
    where tm.team_id = p_team_id and tm.is_lead and tm.user_id <> v_uid
      and not (tm.user_id = any (v_assignees));
  end if;

  return v_task;
end;
$$;

-- Admin: activate/deactivate an account. Data and history stay intact.
-- The server action additionally bans/unbans the auth user with the service role.
create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_org_id();
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_deactivate_self' using errcode = '22023';
  end if;
  update public.profiles
  set is_active = p_active,
      deactivated_at = case when p_active then null else now() end
  where id = p_user_id and org_id = v_org;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  insert into public.admin_audit_logs (org_id, actor_id, action, target_user_id)
  values (v_org, auth.uid(), case when p_active then 'user_reactivated' else 'user_deactivated' end, p_user_id);
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_org_id();
  v_old public.app_role;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_change_own_role' using errcode = '22023';
  end if;
  select role into v_old from public.profiles where id = p_user_id and org_id = v_org for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  insert into public.admin_audit_logs (org_id, actor_id, action, target_user_id, details)
  values (v_org, auth.uid(), 'user_role_changed', p_user_id,
          jsonb_build_object('from', v_old, 'to', p_role));
end;
$$;

create or replace function public.admin_set_team_membership(
  p_team_id uuid, p_user_id uuid, p_is_member boolean, p_is_lead boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_org_id();
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.teams where id = p_team_id and org_id = v_org)
     or not exists (select 1 from public.profiles where id = p_user_id and org_id = v_org) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_is_member then
    insert into public.team_members (team_id, org_id, user_id, is_lead)
    values (p_team_id, v_org, p_user_id, p_is_lead)
    on conflict (team_id, user_id) do update set is_lead = excluded.is_lead;
  else
    delete from public.team_members where team_id = p_team_id and user_id = p_user_id;
  end if;
  insert into public.admin_audit_logs (org_id, actor_id, action, target_user_id, details)
  values (v_org, auth.uid(), 'team_membership_changed', p_user_id,
          jsonb_build_object('team_id', p_team_id, 'is_member', p_is_member, 'is_lead', p_is_lead));
end;
$$;

-- Creates an invite. The caller supplies only the SHA-256 hash of the token.
create or replace function public.admin_create_invite(
  p_email text, p_full_name text, p_role public.app_role, p_team_id uuid, p_token_hash text,
  p_expires_at timestamptz default now() + interval '7 days'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_org_id();
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where org_id = v_org and lower(email) = lower(p_email)) then
    raise exception 'email_already_registered' using errcode = '23505';
  end if;
  if p_expires_at > now() + interval '30 days' then
    raise exception 'invite_expiry_too_long' using errcode = '22023';
  end if;
  insert into public.invites (org_id, email, full_name, role, team_id, token_hash, invited_by, expires_at)
  values (v_org, lower(btrim(p_email)), btrim(p_full_name), p_role, p_team_id, p_token_hash, auth.uid(), p_expires_at)
  returning id into v_id;
  insert into public.admin_audit_logs (org_id, actor_id, action, details)
  values (v_org, auth.uid(), 'invite_created', jsonb_build_object('invite_id', v_id, 'email', lower(p_email), 'role', p_role));
  return v_id;
end;
$$;

create or replace function public.admin_revoke_invite(p_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_org_id();
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  update public.invites set revoked_at = now()
  where id = p_invite_id and org_id = v_org and accepted_at is null and revoked_at is null;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  insert into public.admin_audit_logs (org_id, actor_id, action, details)
  values (v_org, auth.uid(), 'invite_revoked', jsonb_build_object('invite_id', p_invite_id));
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_ids is null or id = any (p_ids))
    and private.my_org_id() is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.organizations       enable row level security;
alter table public.teams               enable row level security;
alter table public.profiles            enable row level security;
alter table public.team_members        enable row level security;
alter table public.skills              enable row level security;
alter table public.member_skills       enable row level security;
alter table public.invites             enable row level security;
alter table public.admin_audit_logs    enable row level security;
alter table public.projects            enable row level security;
alter table public.task_categories     enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_assignees      enable row level security;
alter table public.task_audit_logs     enable row level security;
alter table public.meetings            enable row level security;
alter table public.meeting_attendees   enable row level security;
alter table public.meeting_action_items enable row level security;
alter table public.notifications       enable row level security;
alter table public.member_absences     enable row level security;
alter table public.avatar_appearance   enable row level security;
alter table public.pets                enable row level security;

-- Organization-wide reference data: visible to active members of the org.
create policy org_select on public.organizations for select to authenticated
  using (id = (select private.my_org_id()));
create policy teams_select on public.teams for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy profiles_select on public.profiles for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) and is_active)
  with check (id = (select auth.uid()) and is_active);
create policy team_members_select on public.team_members for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy skills_select on public.skills for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy member_skills_select on public.member_skills for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy member_skills_write_self on public.member_skills for all to authenticated
  using (user_id = (select auth.uid()) and org_id = (select private.my_org_id()))
  with check (user_id = (select auth.uid()) and org_id = (select private.my_org_id()));
create policy categories_select on public.task_categories for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy projects_select on public.projects for select to authenticated
  using (org_id = (select private.my_org_id()) and private.is_team_member(team_id));

-- Admin-only areas.
create policy invites_admin_select on public.invites for select to authenticated
  using (org_id = (select private.my_org_id()) and (select private.is_admin()));
create policy admin_audit_admin_select on public.admin_audit_logs for select to authenticated
  using (org_id = (select private.my_org_id()) and (select private.is_admin()));

-- Tasks: full rows only for authorized viewers.
create policy tasks_select on public.tasks for select to authenticated
  using (private.can_view_task(id));
create policy task_assignees_select on public.task_assignees for select to authenticated
  using (private.can_view_task(task_id));
create policy task_audit_select on public.task_audit_logs for select to authenticated
  using (private.can_view_task(task_id));

-- Meetings: team members and attendees.
create policy meetings_select on public.meetings for select to authenticated
  using (private.can_view_meeting(id));
create policy meeting_attendees_select on public.meeting_attendees for select to authenticated
  using (private.can_view_meeting(meeting_id));
create policy meeting_items_select on public.meeting_action_items for select to authenticated
  using (private.can_view_meeting(meeting_id));

-- Notifications: own only.
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and org_id = (select private.my_org_id()));

-- Absences: full row (with reason) for self and leaders; others use absence_calendar().
create policy absences_select on public.member_absences for select to authenticated
  using (
    org_id = (select private.my_org_id())
    and (user_id = (select auth.uid()) or private.leads_user(user_id))
  );
create policy absences_insert_self on public.member_absences for insert to authenticated
  with check (user_id = (select auth.uid()) and org_id = (select private.my_org_id()));
create policy absences_update_self on public.member_absences for update to authenticated
  using (user_id = (select auth.uid()) and org_id = (select private.my_org_id()))
  with check (user_id = (select auth.uid()) and org_id = (select private.my_org_id()));
create policy absences_delete_self on public.member_absences for delete to authenticated
  using (user_id = (select auth.uid()) and org_id = (select private.my_org_id()));

-- Avatar & pet: visible in the office, editable by owner.
create policy avatar_select on public.avatar_appearance for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy avatar_write_self on public.avatar_appearance for all to authenticated
  using (user_id = (select auth.uid()) and org_id = (select private.my_org_id()))
  with check (user_id = (select auth.uid()) and org_id = (select private.my_org_id()));
create policy pets_select on public.pets for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy pets_write_self on public.pets for all to authenticated
  using (user_id = (select auth.uid()) and org_id = (select private.my_org_id()))
  with check (user_id = (select auth.uid()) and org_id = (select private.my_org_id()));

-- =============================================================================
-- Grants: deny by default, then open exactly what the policies above expect.
-- =============================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on
  public.organizations, public.teams, public.profiles, public.team_members,
  public.skills, public.member_skills, public.invites, public.admin_audit_logs,
  public.projects, public.task_categories, public.tasks, public.task_assignees,
  public.task_audit_logs, public.meetings, public.meeting_attendees,
  public.meeting_action_items, public.notifications, public.member_absences,
  public.avatar_appearance, public.pets
to authenticated;

-- Column-limited self-service profile edits (role / is_active stay admin-only).
grant update (full_name, nickname, job_title, locale, theme, reduce_motion, onboarding_completed_at)
  on public.profiles to authenticated;
grant insert, update, delete on public.member_skills to authenticated;
grant insert, update (starts_on, ends_on, part, reason), delete on public.member_absences to authenticated;
grant insert, update, delete on public.avatar_appearance, public.pets to authenticated;

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
  public.mark_notifications_read(uuid[])
to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
