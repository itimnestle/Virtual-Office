-- =============================================================================
-- Milestone D — social layer
--   * Avatar / pet catalogs enforced in the database.
--   * Self-reported office status (working / focus / break / offsite) that moves
--     the avatar in the 3D office (leave and meetings still take precedence).
--   * Single-room office chat: named or anonymous, text / sticker / image,
--     reactions, @mentions. Expires after 24 hours:
--       - invisible immediately at expires_at (every read path filters it),
--       - rows + mention notifications deleted by the purge job,
--       - uploaded media queued as tombstones and removed from Storage by the
--         app job (/api/jobs/chat-purge) — the DB cannot delete object bytes.
--     The real sender of an anonymous message is readable ONLY through the
--     Admin RPC, which is audited. No table grant exposes sender_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profile preferences (sound / floating chat effects)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column sound_enabled boolean not null default true,
  add column chat_effects boolean not null default true;
grant update (sound_enabled, chat_effects) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Avatar & pet catalogs (keep in sync with src/lib/office/catalog.ts)
-- -----------------------------------------------------------------------------
alter table public.avatar_appearance
  add constraint avatar_skin_ck check (skin = any (array['tone_1','tone_2','tone_3','tone_4','tone_5','tone_6'])),
  add constraint avatar_face_ck check (face = any (array['round','oval','square','heart'])),
  add constraint avatar_eyes_ck check (eyes = any (array['dot','happy','wink','sleepy','sparkle'])),
  add constraint avatar_nose_ck check (nose = any (array['button','small','round','none'])),
  add constraint avatar_mouth_ck check (mouth = any (array['smile','grin','neutral','open','cat'])),
  add constraint avatar_hair_ck check (hair = any (array['short','bob','long','bun','curly','buzz','ponytail','none'])),
  add constraint avatar_hair_color_ck check (hair_color = any (array['black','brown','blonde','pink','blue','gray','red'])),
  add constraint avatar_top_ck check (top = any (array['tshirt','hoodie','shirt','blazer','sweater','polo'])),
  add constraint avatar_bottom_ck check (bottom = any (array['pants','skirt','shorts','jeans'])),
  add constraint avatar_shoes_ck check (shoes = any (array['sneakers','loafers','boots','sandals'])),
  add constraint avatar_glasses_ck check (glasses = any (array['none','round','square'])),
  add constraint avatar_accessory_ck check (accessory = any (array['none','headphones','cap','hat','flower','bowtie']));

alter table public.pets
  add constraint pet_breed_ck check (
    (species = 'dog' and breed = any (array['shiba','corgi','poodle','golden','pug']))
    or (species = 'cat' and breed = any (array['scottish_fold','siamese','persian','tabby','black_cat']))
  ),
  add constraint pet_color_ck check (color = any (array['cream','brown','black','white','orange','gray'])),
  add constraint pet_outfit_ck check (outfit = any (array['none','bandana','bow','sweater','raincoat']));

-- -----------------------------------------------------------------------------
-- Self-reported office status
-- -----------------------------------------------------------------------------
create type public.office_status_kind as enum ('working', 'focus', 'break', 'offsite');

create table public.office_status (
  user_id     uuid primary key,
  org_id      uuid not null,
  status      public.office_status_kind not null default 'working',
  note        text check (char_length(note) <= 80),
  -- Status lapses back to "working" afterwards (default: end of the Bangkok work day).
  until       timestamptz,
  updated_at  timestamptz not null default now(),
  foreign key (user_id, org_id) references public.profiles (id, org_id) on delete restrict
);
create trigger office_status_touch before update on public.office_status
  for each row execute function private.touch_updated_at();
alter table public.office_status enable row level security;
create policy office_status_select on public.office_status for select to authenticated
  using (org_id = (select private.my_org_id()));
create policy office_status_write_self on public.office_status for all to authenticated
  using (user_id = (select auth.uid()) and org_id = (select private.my_org_id()))
  with check (user_id = (select auth.uid()) and org_id = (select private.my_org_id()));
grant select, insert, update, delete on public.office_status to authenticated;
grant all on public.office_status to service_role;

-- -----------------------------------------------------------------------------
-- Chat
-- -----------------------------------------------------------------------------
create type public.chat_kind as enum ('text', 'sticker', 'image');

create table public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  sender_id     uuid not null,
  is_anonymous  boolean not null default false,
  kind          public.chat_kind not null default 'text',
  body          text check (char_length(body) <= 1000),
  sticker       text check (sticker ~ '^[a-z_]{1,32}$'),
  media_path    text unique,
  mentions      uuid[] not null default '{}',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours',
  foreign key (sender_id, org_id) references public.profiles (id, org_id) on delete restrict,
  check (kind <> 'text' or char_length(btrim(body)) > 0),
  check (kind <> 'sticker' or sticker is not null),
  check (kind <> 'image' or media_path is not null),
  check (expires_at <= created_at + interval '24 hours')
);
create index chat_messages_feed_idx on public.chat_messages (org_id, created_at desc);
create index chat_messages_expiry_idx on public.chat_messages (expires_at);

create table public.chat_reactions (
  message_id  uuid not null references public.chat_messages (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete restrict,
  emoji       text not null check (emoji = any (array['👍','❤️','😂','😮','🎉','🙏'])),
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- Media of purged messages, waiting for the app job to delete the bytes.
create table public.chat_media_tombstones (
  path        text primary key,
  expired_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

alter table public.chat_messages         enable row level security;
alter table public.chat_reactions        enable row level security;
alter table public.chat_media_tombstones enable row level security;
-- Deliberately NO policies or grants for authenticated: all access via RPCs,
-- so sender_id of anonymous messages can never be selected directly.
grant all on public.chat_messages, public.chat_reactions, public.chat_media_tombstones to service_role;

create or replace function private.chat_stickers()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['cheer','coffee','thanks','love','lol','wow','sleepy','party','fighting','ok'];
$$;

-- Feed for the caller's organization (unexpired only). Anonymous messages
-- carry no sender information except "is_mine" for the author themself.
create or replace function public.chat_feed(p_limit integer default 80)
returns table (
  id            uuid,
  kind          public.chat_kind,
  body          text,
  sticker       text,
  media_path    text,
  is_anonymous  boolean,
  is_mine       boolean,
  sender_id     uuid,
  sender_name   text,
  mentions_me   boolean,
  created_at    timestamptz,
  expires_at    timestamptz,
  reactions     jsonb,
  my_reactions  text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select
      m.id, m.kind, m.body, m.sticker, m.media_path, m.is_anonymous,
      m.sender_id = auth.uid() as is_mine,
      case when m.is_anonymous then null else m.sender_id end as sender_id,
      case when m.is_anonymous then null else private.actor_name(m.sender_id) end as sender_name,
      auth.uid() = any (m.mentions) as mentions_me,
      m.created_at, m.expires_at,
      coalesce((select jsonb_object_agg(r.emoji, r.n) from (
        select cr.emoji, count(*) as n from public.chat_reactions cr where cr.message_id = m.id group by cr.emoji
      ) r), '{}'::jsonb) as reactions,
      coalesce(array(select cr.emoji from public.chat_reactions cr where cr.message_id = m.id and cr.user_id = auth.uid()), '{}') as my_reactions
    from public.chat_messages m
    where m.org_id = private.my_org_id()
      and m.expires_at > now()
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 80), 1), 200)
  ) f
  order by f.created_at asc;
$$;

create or replace function public.send_chat_message(
  p_kind        public.chat_kind,
  p_body        text default null,
  p_sticker     text default null,
  p_media_path  text default null,
  p_anonymous   boolean default false,
  p_mentions    uuid[] default '{}'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_org      uuid := private.my_org_id();
  v_id       uuid;
  v_mentions uuid[];
  v_ok       boolean;
begin
  if v_org is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if (select count(*) from public.chat_messages
      where sender_id = v_uid and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'chat_rate_limited' using errcode = '22023';
  end if;
  if p_kind = 'text' and coalesce(char_length(btrim(p_body)), 0) = 0 then
    raise exception 'comment_required' using errcode = '22023';
  end if;
  if p_kind = 'sticker' and not (p_sticker = any (private.chat_stickers())) then
    raise exception 'invalid_sticker' using errcode = '22023';
  end if;
  if p_kind = 'image' then
    if p_media_path is null or p_media_path not like v_org::text || '/%' or p_media_path like '%..%' then
      raise exception 'invalid_attachment_path' using errcode = '22023';
    end if;
    -- The image must be the caller's own upload into this org's chat folder.
    if to_regclass('storage.objects') is not null then
      execute 'select exists (select 1 from storage.objects where bucket_id = ''chat-media'' and name = $1
                 and coalesce(owner_id, owner::text) = $2)'
        into v_ok using p_media_path, v_uid::text;
      if not v_ok then
        raise exception 'attachment_not_uploaded' using errcode = '22023';
      end if;
    end if;
  end if;

  v_mentions := coalesce(array(
    select distinct x from unnest(coalesce(p_mentions, '{}')) x
    join public.profiles p on p.id = x and p.org_id = v_org and p.is_active
    where x <> v_uid
  ), '{}');

  insert into public.chat_messages (org_id, sender_id, is_anonymous, kind, body, sticker, media_path, mentions)
  values (v_org, v_uid, coalesce(p_anonymous, false), p_kind,
          nullif(btrim(left(p_body, 1000)), ''),
          case when p_kind = 'sticker' then p_sticker end,
          case when p_kind = 'image' then p_media_path end,
          v_mentions)
  returning id into v_id;

  -- Mention notifications carry no chat text and no identity for anonymous
  -- senders; they are deleted together with the message by the purge job.
  insert into public.notifications (org_id, user_id, kind, payload, actor_id)
  select v_org, m, 'chat_mentioned',
         jsonb_build_object('message_id', v_id, 'anonymous', coalesce(p_anonymous, false),
                            'actor_name', case when coalesce(p_anonymous, false) then null else private.actor_name(v_uid) end),
         case when coalesce(p_anonymous, false) then null else v_uid end
  from unnest(v_mentions) m;

  return v_id;
end;
$$;

create or replace function public.react_chat_message(p_message_id uuid, p_emoji text, p_on boolean default true)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.chat_messages m
    where m.id = p_message_id and m.org_id = private.my_org_id() and m.expires_at > now()
  ) then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.chat_reactions (message_id, user_id, emoji) values (p_message_id, auth.uid(), p_emoji)
    on conflict do nothing;
  else
    delete from public.chat_reactions where message_id = p_message_id and user_id = auth.uid() and emoji = p_emoji;
  end if;
end;
$$;

-- Admin-only identity lookup for an anonymous message. Every lookup is audited
-- (who looked, which message) without copying the chat content.
create or replace function public.admin_chat_identity(p_message_id uuid)
returns table (sender_id uuid, sender_name text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_m public.chat_messages;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select * into v_m from public.chat_messages
  where id = p_message_id and org_id = private.my_org_id() and expires_at > now();
  if not found then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  insert into public.admin_audit_logs (org_id, actor_id, action, target_user_id, details)
  values (v_m.org_id, auth.uid(), 'chat_identity_revealed', v_m.sender_id, jsonb_build_object('message_id', v_m.id));
  return query select v_m.sender_id, private.actor_name(v_m.sender_id);
end;
$$;

-- Storage read check for chat media: only while a live message references it.
create or replace function private.chat_media_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_messages m
    where m.media_path = p_name and m.org_id = private.my_org_id() and m.expires_at > now()
  );
$$;

-- Purge: delete expired rows (and their mention notifications), queue media.
create or replace function public.run_chat_purge(p_now timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run bigint;
  v_n   integer;
begin
  insert into public.job_runs (job) values ('chat_purge') returning id into v_run;

  insert into public.chat_media_tombstones (path, expired_at)
  select m.media_path, m.expires_at from public.chat_messages m
  where m.expires_at <= p_now and m.media_path is not null
  on conflict (path) do nothing;

  delete from public.notifications n
  using public.chat_messages m
  where n.kind = 'chat_mentioned' and m.expires_at <= p_now
    and n.payload ->> 'message_id' = m.id::text;

  delete from public.chat_messages where expires_at <= p_now;
  get diagnostics v_n = row_count;

  update public.job_runs set finished_at = clock_timestamp(), status = 'succeeded', affected = v_n where id = v_run;
  return v_n;
exception when others then
  insert into public.job_runs (job, finished_at, status, error)
  values ('chat_purge', clock_timestamp(), 'failed', sqlerrm);
  return 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.run_chat_purge(timestamptz) from authenticated;
grant execute on function
  public.chat_feed(integer),
  public.send_chat_message(public.chat_kind, text, text, text, boolean, uuid[]),
  public.react_chat_message(uuid, text, boolean),
  public.admin_chat_identity(uuid)
to authenticated;
grant execute on all functions in schema public to service_role;

-- -----------------------------------------------------------------------------
-- Supabase-only: media bucket, realtime signals, purge schedule
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chat-media', 'chat-media', false, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;
    -- Object names are {org}/{random}.{ext} — never the sender's id.
    execute $p$
      create policy chat_media_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'chat-media'
        and (storage.foldername(name))[1] = (select private.my_org_id())::text
        and array_length(storage.foldername(name), 1) = 1
      )
    $p$;
    execute $p$
      create policy chat_media_select on storage.objects for select to authenticated
      using (bucket_id = 'chat-media' and private.chat_media_visible(name))
    $p$;
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'private' and p.proname = 'signal_org_change') then
    execute 'create trigger chat_messages_signal after insert or delete on public.chat_messages for each row execute function private.signal_org_change(''chat'')';
    execute 'create trigger office_status_signal after insert or update or delete on public.office_status for each row execute function private.signal_org_change(''absences'')';
    execute $f$
      create or replace function private.signal_chat_reaction()
      returns trigger
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        v_org uuid;
      begin
        select org_id into v_org from public.chat_messages where id = coalesce(new.message_id, old.message_id);
        if v_org is not null then
          perform realtime.send(jsonb_build_object('entity', 'chat'), 'changed', 'org:' || v_org::text, true);
        end if;
        return null;
      end;
      $body$
    $f$;
    execute 'create trigger chat_reactions_signal after insert or delete on public.chat_reactions for each row execute function private.signal_chat_reaction()';
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $c$ select cron.schedule('chat-purge', '*/10 * * * *', 'select public.run_chat_purge()') $c$;
  end if;
end;
$$;
