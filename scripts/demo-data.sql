-- OPTIONAL DEMO DATA — LOCAL / STAGING DEMOS ONLY. Never run against production.
-- Adds ~150 synthetic tasks spread over the last 60 days so reports, the task
-- board and the pitch video show realistic activity. Every row is marked with
-- description 'ข้อมูลตัวอย่าง (เดโม)'. Remove them with:
--   set session_replication_role = replica;
--   delete from public.task_submissions where task_id in (select id from public.tasks where description = 'ข้อมูลตัวอย่าง (เดโม)');
--   delete from public.tasks where description = 'ข้อมูลตัวอย่าง (เดโม)';
--   (archived tasks are immutable, so triggers must be paused for the cleanup too)
-- Run:  bash scripts/demo-data.sh   (after `npx supabase db reset`)
-- Triggers are paused for this session only, so the rows are inserted as-is
-- (no notifications, no audit entries).

set session_replication_role = replica;
select setseed(0.42);

with org as (
  select id from public.organizations order by created_at limit 1
), team as (
  select t.id from public.teams t, org where t.org_id = org.id order by t.created_at limit 1
), lead as (
  select p.id from public.profiles p, org where p.org_id = org.id and p.role = 'manager' order by p.created_at limit 1
), members as (
  select array_agg(p.id order by p.created_at) ids from public.profiles p, org
  where p.org_id = org.id and p.role = 'member' and p.is_active
), cats as (
  select array_agg(c.id order by c.sort_order) ids from public.task_categories c, org where c.org_id = org.id and c.is_active
), titles as (
  select array[
    'สรุปยอดขายประจำสัปดาห์', 'ออกแบบแบนเนอร์แคมเปญ', 'ตรวจสอบสัญญาลูกค้าใหม่', 'อัปเดตเว็บไซต์หน้าสินค้า',
    'เตรียมสไลด์ประชุมผู้บริหาร', 'วิเคราะห์ผลแบบสอบถามลูกค้า', 'จัดทำรายงานงบประมาณ', 'วางแผนคอนเทนต์โซเชียล',
    'ทดสอบระบบสั่งซื้อออนไลน์', 'ประสานงานซัพพลายเออร์', 'อบรมพนักงานใหม่', 'ปรับปรุงคู่มือการทำงาน',
    'ติดตามใบแจ้งหนี้ค้างชำระ', 'เตรียมงานอีเวนต์เปิดตัว', 'ถ่ายภาพสินค้าคอลเลกชันใหม่', 'สรุปผลแคมเปญโฆษณา'
  ] t
), plan as (
  select d, n, now() - make_interval(days => d) + make_interval(hours => 2 + (random() * 8)::int) as created
  from generate_series(59, 0, -1) d, generate_series(1, 1 + (random() * 3)::int) n
), shaped as (
  select p.*, random() r, (3 + (random() * 7)::int) due_days, (1 + (random() * 5)::int) work_days
  from plan p
)
insert into public.tasks (org_id, team_id, category_id, title, description, status, priority, is_urgent, size, estimated_hours,
  due_at, created_by, completed_at, archived_at, archived_by, created_at, updated_at)
select org.id, team.id,
  cats.ids[1 + floor(random() * coalesce(array_length(cats.ids, 1), 1))::int],
  titles.t[1 + floor(random() * array_length(titles.t, 1))::int],
  'ข้อมูลตัวอย่าง (เดโม)',
  -- Older work is mostly finished; recent work is still moving.
  (case
    when s.d > 6 and s.r < 0.78 then 'completed'
    when s.r < 0.30 then 'in_progress'
    when s.r < 0.45 then 'in_review'
    when s.r < 0.50 then 'revision_required'
    when s.r < 0.53 then 'blocked'
    else 'not_started' end)::public.task_status,
  (array['low', 'medium', 'medium', 'high'])[1 + floor(random() * 4)::int]::public.task_priority,
  random() < 0.12,
  (array['xs', 's', 'm', 'm', 'l', 'xl'])[1 + floor(random() * 6)::int]::public.task_size,
  (array[1, 2, 3, 4, 6, 8, 12])[1 + floor(random() * 7)::int],
  s.created + make_interval(days => s.due_days),
  lead.id,
  case when s.d > 6 and s.r < 0.78 then s.created + make_interval(days => s.work_days) end,
  case when s.d > 6 and s.r < 0.78 then s.created + make_interval(days => s.work_days) end,
  case when s.d > 6 and s.r < 0.78 then lead.id end,
  s.created, s.created
from shaped s, org, team, lead, cats, titles;

-- One or two members per demo task.
insert into public.task_assignees (task_id, org_id, user_id, is_primary, assigned_by, assigned_at)
select t.id, t.org_id, m.ids[1 + floor(random() * array_length(m.ids, 1))::int], true, t.created_by, t.created_at
from public.tasks t, (select array_agg(p.id order by p.created_at) ids from public.profiles p where p.role = 'member' and p.is_active) m
where t.description = 'ข้อมูลตัวอย่าง (เดโม)'
on conflict do nothing;

insert into public.task_assignees (task_id, org_id, user_id, is_primary, assigned_by, assigned_at)
select t.id, t.org_id, m.ids[1 + floor(random() * array_length(m.ids, 1))::int], true, t.created_by, t.created_at
from public.tasks t, (select array_agg(p.id order by p.created_at) ids from public.profiles p where p.role = 'member' and p.is_active) m
where t.description = 'ข้อมูลตัวอย่าง (เดโม)' and random() < 0.3
on conflict do nothing;

-- Work waiting for review has a submission from its first assignee, so the
-- review form (approve / request changes) appears as it would in real use.
insert into public.task_submissions (org_id, task_id, submitted_by, note, review_level, created_at)
select t.org_id, t.id, a.user_id, 'ส่งงานแล้ว แนบสรุปไว้ในความคิดเห็นด้านล่าง รบกวนตรวจด้วยครับ', 'manager',
  least(now(), t.created_at + interval '1 day')
from public.tasks t
join lateral (select user_id from public.task_assignees x where x.task_id = t.id order by x.assigned_at limit 1) a on true
where t.description = 'ข้อมูลตัวอย่าง (เดโม)' and t.status = 'in_review'
  and not exists (select 1 from public.task_submissions s where s.task_id = t.id);

set session_replication_role = origin;
select count(*) as demo_tasks from public.tasks where description = 'ข้อมูลตัวอย่าง (เดโม)';
