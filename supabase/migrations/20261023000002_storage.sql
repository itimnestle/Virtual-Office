-- =============================================================================
-- Private task-file storage. Object path convention:
--   task-files/{org_id}/{task_id}/{uuid}-{filename}
-- Read/write is decided by private.can_view_task(), the same rule as the tasks
-- table, so a private task's files never reach an unrelated member — signed
-- URLs can only be minted by someone who can already read the object.
-- Guarded so the migration also applies on databases without Supabase Storage
-- (e.g. the PGlite test harness).
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present; skipping storage policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('task-files', 'task-files', false, 52428800)
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

  execute $p$
    create policy task_files_select on storage.objects for select to authenticated
    using (
      bucket_id = 'task-files'
      and (storage.foldername(name))[1] = (select private.my_org_id())::text
      and private.can_view_task(private.try_uuid((storage.foldername(name))[2]))
    )
  $p$;

  execute $p$
    create policy task_files_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'task-files'
      and (storage.foldername(name))[1] = (select private.my_org_id())::text
      and private.can_view_task(private.try_uuid((storage.foldername(name))[2]))
      and exists (
        select 1 from public.tasks t
        where t.id = private.try_uuid((storage.foldername(name))[2]) and t.archived_at is null
      )
    )
  $p$;
  -- No update/delete policies: files are versioned by new uploads (Milestone C)
  -- and archived task files stay read-only.
end;
$$;
