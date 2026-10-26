-- =============================================================================
-- Milestone E — reporting and exports
--   * report_tasks(): rows behind every report. ONLY tasks the caller can open
--     (private tasks of others are excluded entirely, so no aggregate can leak
--     their status, timing or hours). Activity window = created, due or
--     completed within the range.
--   * On-time is judged by the submission that was approved (when the work was
--     handed in), not by the reviewer's approval time.
--   * log_export(): every export is audited (who, what, format, row count —
--     never the exported content).
-- =============================================================================

create or replace function public.report_tasks(p_from date, p_to date)
returns table (
  id                     uuid,
  team_id                uuid,
  category_id            uuid,
  status                 public.task_status,
  priority               public.task_priority,
  size                   public.task_size,
  is_urgent              boolean,
  is_private             boolean,
  estimated_hours        numeric,
  due_at                 timestamptz,
  created_at             timestamptz,
  completed_at           timestamptz,
  archived_at            timestamptz,
  approved_submitted_at  timestamptz,
  assignee_ids           uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id, t.team_id, t.category_id, t.status, t.priority, t.size, t.is_urgent, t.is_private,
    t.estimated_hours, t.due_at, t.created_at, t.completed_at, t.archived_at,
    (select s.created_at
       from public.task_reviews r join public.task_submissions s on s.id = r.submission_id
      where r.task_id = t.id and r.decision = 'approved'
      order by r.created_at desc limit 1),
    array(select a.user_id from public.task_assignees a where a.task_id = t.id order by a.assigned_at)
  from public.tasks t
  where t.org_id = private.my_org_id()
    and private.can_view_task(t.id)
    and p_to >= p_from
    and p_to - p_from <= 731
    and (
      (t.created_at at time zone 'Asia/Bangkok')::date between p_from and p_to
      or (t.due_at at time zone 'Asia/Bangkok')::date between p_from and p_to
      or (t.completed_at at time zone 'Asia/Bangkok')::date between p_from and p_to
      -- Work still open at the end of the window counts as current load.
      or (t.archived_at is null and t.status not in ('completed', 'cancelled')
          and (t.created_at at time zone 'Asia/Bangkok')::date <= p_to)
    );
$$;

create or replace function public.log_export(p_kind text, p_format text, p_rows integer, p_filters jsonb default '{}')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.my_org_id();
begin
  if v_org is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_kind not in ('tasks', 'report') or p_format not in ('csv', 'xlsx', 'pdf') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.admin_audit_logs (org_id, actor_id, action, details)
  values (v_org, auth.uid(), 'export',
          jsonb_build_object('kind', p_kind, 'format', p_format, 'rows', p_rows, 'filters', coalesce(p_filters, '{}')));
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.report_tasks(date, date),
  public.log_export(text, text, integer, jsonb)
to authenticated;
grant execute on all functions in schema public to service_role;
