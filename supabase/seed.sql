-- =============================================================================
-- Synthetic seed data — LOCAL / TEST ONLY. No real employees or secrets.
-- 1 Admin, 1 Director, 1 Manager, 7 Members in one organization/team.
-- Every login uses the synthetic password: VirtualOffice2026
-- Accounts go through the same invite-only trigger as production: each user
-- presents a one-time invite token (hashed + matched in the DB). The first
-- Admin's invite is created with service-level access (invited_by = null);
-- the Admin invites everyone else. Tasks are created through
-- public.create_task() impersonating each role.
-- =============================================================================

-- Fixed ids keep tests and docs stable.
--   org     00000000-0000-4000-8000-000000000001
--   team    10000000-0000-4000-8000-000000000001
--   admin   20000000-0000-4000-8000-000000000001
--   director 20000000-0000-4000-8000-000000000002
--   manager 20000000-0000-4000-8000-000000000003
--   members 20000000-0000-4000-8000-00000000001{1..7}

insert into public.organizations (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Demo Office (synthetic)');

insert into public.teams (id, org_id, name)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Creative Team');

insert into public.task_categories (org_id, name_th, name_en, sort_order) values
  ('00000000-0000-4000-8000-000000000001', 'เอกสาร', 'Documents', 1),
  ('00000000-0000-4000-8000-000000000001', 'ออกแบบ', 'Design', 2),
  ('00000000-0000-4000-8000-000000000001', 'ลูกค้า', 'Client', 3),
  ('00000000-0000-4000-8000-000000000001', 'บริหาร', 'Management', 4);

insert into public.task_tags (org_id, name, color) values
  ('00000000-0000-4000-8000-000000000001', 'ลูกค้า-A', '#f08a5d'),
  ('00000000-0000-4000-8000-000000000001', 'ไตรมาส4', '#5cc2ab'),
  ('00000000-0000-4000-8000-000000000001', 'ภายใน', '#8fb3ff');

insert into public.skills (org_id, name_th, name_en) values
  ('00000000-0000-4000-8000-000000000001', 'เขียนรายงาน', 'Report writing'),
  ('00000000-0000-4000-8000-000000000001', 'ออกแบบกราฟิก', 'Graphic design'),
  ('00000000-0000-4000-8000-000000000001', 'วิเคราะห์ข้อมูล', 'Data analysis'),
  ('00000000-0000-4000-8000-000000000001', 'ประสานงานลูกค้า', 'Client coordination');

-- Helper: insert an auth user + email identity the way GoTrue stores them.
create or replace function pg_temp.seed_auth_user(p_id uuid, p_email text, p_invite_token text)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('VirtualOffice2026', extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('invite_token', p_invite_token), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );
end;
$$;

-- 1) First Admin: invite created with service-level access, then accepted.
create temp table seed_people (id uuid, email text, full_name text, role public.app_role, nickname text, job_title text, token text);
insert into seed_people values
  ('20000000-0000-4000-8000-000000000001', 'admin@example.com',    'Ada Admin',      'admin',    'แอดมิน', 'ผู้ดูแลระบบ', null),
  ('20000000-0000-4000-8000-000000000002', 'director@example.com', 'Dara Director',  'director', 'ดารา',  'ผู้อำนวยการ', null),
  ('20000000-0000-4000-8000-000000000003', 'manager@example.com',  'Mana Manager',   'manager',  'มานะ',  'ผู้จัดการทีม', null),
  ('20000000-0000-4000-8000-000000000011', 'member1@example.com',  'Mali Member',    'member',   'มะลิ',  'นักวิเคราะห์', null),
  ('20000000-0000-4000-8000-000000000012', 'member2@example.com',  'Kanok Member',   'member',   'กนก',   'กราฟิกดีไซเนอร์', null),
  ('20000000-0000-4000-8000-000000000013', 'member3@example.com',  'Pim Member',     'member',   'พิม',   'กราฟิกดีไซเนอร์', null),
  ('20000000-0000-4000-8000-000000000014', 'member4@example.com',  'Tawan Member',   'member',   'ตะวัน', 'ผู้ประสานงานลูกค้า', null),
  ('20000000-0000-4000-8000-000000000015', 'member5@example.com',  'Nok Member',     'member',   'นก',    'นักเขียนคอนเทนต์', null),
  ('20000000-0000-4000-8000-000000000016', 'member6@example.com',  'Fah Member',     'member',   'ฟ้า',   'นักวิเคราะห์ข้อมูล', null),
  ('20000000-0000-4000-8000-000000000017', 'member7@example.com',  'Chai Member',    'member',   'ชัย',   'ผู้ช่วยโครงการ', null);
update seed_people set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

insert into public.invites (org_id, email, full_name, role, team_id, token_hash, invited_by, expires_at)
select '00000000-0000-4000-8000-000000000001', p.email, p.full_name, p.role, null,
       encode(sha256(convert_to(p.token, 'UTF8')), 'hex'), null, now() + interval '1 day'
from seed_people p where p.role = 'admin';
select pg_temp.seed_auth_user(p.id, p.email, p.token) from seed_people p where p.role = 'admin';

-- 2) The Admin invites everyone else into the team; each accepts with its token.
insert into public.invites (org_id, email, full_name, role, team_id, token_hash, invited_by, expires_at)
select '00000000-0000-4000-8000-000000000001', p.email, p.full_name, p.role,
       '10000000-0000-4000-8000-000000000001',
       encode(sha256(convert_to(p.token, 'UTF8')), 'hex'),
       '20000000-0000-4000-8000-000000000001', now() + interval '7 days'
from seed_people p where p.role <> 'admin';
select pg_temp.seed_auth_user(p.id, p.email, p.token) from seed_people p where p.role <> 'admin';

update public.profiles pr
set nickname = p.nickname, job_title = p.job_title, onboarding_completed_at = now()
from seed_people p where pr.id = p.id;

-- The Director's invite carried the team, so they are a (non-lead) team member;
-- org-wide oversight comes from the director role itself.

-- Skills (rule-based assignment input in Milestone C).
insert into public.member_skills (user_id, skill_id, org_id, level)
select p.id, s.id, s.org_id, 2 + (abs(hashtext(p.email || s.name_en)) % 4)
from seed_people p cross join public.skills s
where p.role = 'member';

-- Avatars & pets.
insert into public.avatar_appearance (user_id, org_id, skin, hair, hair_color, top, glasses)
select pr.id, pr.org_id,
       (array['tone_1','tone_2','tone_3','tone_4','tone_5'])[1 + abs(hashtext(pr.email)) % 5],
       (array['short','bob','long','bun','curly'])[1 + abs(hashtext(pr.email || 'h')) % 5],
       (array['black','brown','blonde','pink','blue'])[1 + abs(hashtext(pr.email || 'c')) % 5],
       (array['tshirt','hoodie','shirt','blazer','sweater'])[1 + abs(hashtext(pr.email || 't')) % 5],
       (array['none','round','square'])[1 + abs(hashtext(pr.email || 'g')) % 3]
from public.profiles pr;

insert into public.pets (user_id, org_id, species, breed, color, name)
select pr.id, pr.org_id,
       case when abs(hashtext(pr.email)) % 2 = 0 then 'dog'::public.pet_species else 'cat'::public.pet_species end,
       case when abs(hashtext(pr.email)) % 2 = 0 then 'shiba' else 'scottish_fold' end,
       (array['cream','brown','black','white'])[1 + abs(hashtext(pr.email || 'p')) % 4],
       (array['โมจิ','ถั่วแดง','ขนมปัง','ส้มโอ','บัวลอย'])[1 + abs(hashtext(pr.email || 'n')) % 5]
from public.profiles pr
where pr.role <> 'admin';

-- 3) Tasks through the real RPC, impersonating each actor.
create or replace function pg_temp.act_as(p_user uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, false);
$$;

-- Manager → Member (normal path)
select pg_temp.act_as('20000000-0000-4000-8000-000000000003');
select public.create_task(
  p_team_id => '10000000-0000-4000-8000-000000000001',
  p_title => 'เตรียมรายงานยอดขายไตรมาส 3',
  p_description => 'สรุปยอดขายแยกตามช่องทาง พร้อมกราฟเปรียบเทียบไตรมาสก่อน',
  p_assignee_ids => array['20000000-0000-4000-8000-000000000011']::uuid[],
  p_priority => 'high', p_size => 'm', p_estimated_hours => 12,
  p_due_at => date_trunc('day', now()) + interval '5 days 10 hours'
);
-- Manager → two primary co-owners
select public.create_task(
  p_team_id => '10000000-0000-4000-8000-000000000001',
  p_title => 'ออกแบบโปสเตอร์งานสัมมนา',
  p_description => 'โปสเตอร์ A2 และภาพโซเชียล 3 ขนาด',
  p_assignee_ids => array['20000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000013']::uuid[],
  p_size => 'l', p_estimated_hours => 20,
  p_due_at => date_trunc('day', now()) + interval '9 days 9 hours'
);
-- PRIVATE task: only creator, assignee, leads, Director, Admin see details.
select public.create_task(
  p_team_id => '10000000-0000-4000-8000-000000000001',
  p_title => 'ประเมินผลงานพนักงานทดลองงาน',
  p_description => 'CONFIDENTIAL-SEED: รายละเอียดการประเมินผลรายบุคคล ห้ามเปิดเผย',
  p_assignee_ids => array['20000000-0000-4000-8000-000000000015']::uuid[],
  p_is_private => true, p_priority => 'high', p_size => 's', p_estimated_hours => 4,
  p_due_at => date_trunc('day', now()) + interval '3 days 8 hours'
);

-- Director → Member directly (URGENT path; Manager gets a notice)
select pg_temp.act_as('20000000-0000-4000-8000-000000000002');
select public.create_task(
  p_team_id => '10000000-0000-4000-8000-000000000001',
  p_title => 'แก้ไขสไลด์นำเสนอลูกค้าด่วน',
  p_description => 'ลูกค้าขอปรับหน้าราคาก่อนประชุมพรุ่งนี้',
  p_assignee_ids => array['20000000-0000-4000-8000-000000000014']::uuid[],
  p_is_urgent => true, p_priority => 'high', p_size => 's', p_estimated_hours => 3,
  p_due_at => date_trunc('day', now()) + interval '1 day 9 hours'
);
-- Director → Manager (Manager-owned work is reviewed by the Director)
select public.create_task(
  p_team_id => '10000000-0000-4000-8000-000000000001',
  p_title => 'จัดทำแผนงบประมาณปี 2027',
  p_description => 'ร่างงบประมาณทีมพร้อมเหตุผลประกอบ',
  p_assignee_ids => array['20000000-0000-4000-8000-000000000003']::uuid[],
  p_size => 'xl', p_estimated_hours => 30,
  p_due_at => date_trunc('day', now()) + interval '14 days 9 hours'
);

-- Member self-created work (starts immediately; Manager + Director notified)
select pg_temp.act_as('20000000-0000-4000-8000-000000000016');
select public.create_task(
  p_team_id => '10000000-0000-4000-8000-000000000001',
  p_title => 'ปรับปรุงคู่มือการใช้งานภายใน',
  p_description => 'อัปเดตภาพหน้าจอและขั้นตอนใหม่',
  p_size => 's', p_estimated_hours => 5
);
-- Member self-created PRIVATE work
select pg_temp.act_as('20000000-0000-4000-8000-000000000017');
select public.create_task(
  p_team_id => '10000000-0000-4000-8000-000000000001',
  p_title => 'เตรียมเอกสารขอทุนศึกษาต่อ',
  p_description => 'CONFIDENTIAL-SEED: เอกสารส่วนตัวสำหรับยื่นทุน',
  p_is_private => true, p_size => 'xs', p_estimated_hours => 2
);

select set_config('request.jwt.claims', '', false);
drop table seed_people;

-- 4) A finished meeting with three unassigned action items (Milestone B demo).
insert into public.meetings (id, org_id, team_id, title, starts_at, ends_at, summary, created_by)
values (
  '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'ประชุมวางแผนแคมเปญปลายปี',
  now() - interval '26 hours', now() - interval '25 hours',
  'สรุป: ต้องเตรียมแคมเปญโซเชียล งบโฆษณา และรายชื่อลูกค้าเป้าหมาย',
  '20000000-0000-4000-8000-000000000003'
);
insert into public.meeting_attendees (meeting_id, org_id, user_id, is_proxy)
select '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', u, false
from unnest(array[
  '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000012'
]::uuid[]) u;
insert into public.meeting_action_items (org_id, meeting_id, title, created_by) values
  ('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'วางแผนคอนเทนต์โซเชียล 4 สัปดาห์', '20000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'สรุปงบโฆษณาต่อช่องทาง', '20000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'รวบรวมรายชื่อลูกค้าเป้าหมาย', '20000000-0000-4000-8000-000000000003');

-- 5) An upcoming leave with a private reason.
insert into public.member_absences (org_id, user_id, starts_on, ends_on, part, reason)
values (
  '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000013',
  ((now() at time zone 'Asia/Bangkok')::date + 7), ((now() at time zone 'Asia/Bangkok')::date + 8),
  'full_day', 'CONFIDENTIAL-SEED: ธุระครอบครัว'
);
