-- Performance: compute the per-row access check once in task_directory.
-- Found with ~190 demo tasks: the directory took ~6 s (statement timeout under
-- concurrent page loads) because the planner flattened the LATERAL subquery and
-- evaluated private.can_view_task() once per reference. Behaviour is unchanged.

create or replace function public.task_directory(p_team_id uuid default null)
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
  -- offset 0 keeps this subquery from being inlined; otherwise the access check
  -- re-runs at every one of the ~20 places v.ok is referenced (≈30 ms per row).
  cross join lateral (select private.can_view_task(t.id) as ok offset 0) v
  where t.org_id = private.my_org_id()
    and (p_team_id is null or t.team_id = p_team_id)
    and (v.ok or (t.is_private and private.is_team_member(t.team_id)))
  order by t.created_at desc;
$$;
