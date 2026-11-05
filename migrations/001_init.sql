-- Going Concern platform: universities (tenants), people, sign-in, courses and hand-ins.
--
-- Isolation: every table holding a university's data carries tenant_id, and row-level security (FORCED, so it applies
-- to the table owner too) only shows rows whose tenant_id matches app.tenant_id, which the app sets at the start of
-- every transaction. The platform console sets app.platform = 'on' instead. The app's database role must not be a
-- superuser: superusers skip row-level security.

create or replace function app_tenant() returns uuid language sql stable as
$$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;
create or replace function app_is_platform() returns boolean language sql stable as
$$ select coalesce(current_setting('app.platform', true), '') = 'on' $$;

-- Universities ------------------------------------------------------------------------------------------------------

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  name text not null check (length(name) between 2 and 120),
  status text not null default 'active' check (status in ('trial', 'active', 'suspended', 'closed')),
  brand_color text check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  seat_limit integer check (seat_limit is null or seat_limit > 0),
  contract_start date,
  contract_end date,
  retention_months integer not null default 12 check (retention_months between 1 and 120),
  directory_id text,
  terms_accepted_at timestamptz,
  terms_accepted_by uuid,
  created_at timestamptz not null default now()
);

create table tenant_domains (
  tenant_id uuid not null references tenants(id) on delete cascade,
  domain text not null unique check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  include_subdomains boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, domain)
);

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null check (email = lower(email)),
  name text not null default '',
  student_id text not null default '',
  role text not null default 'student' check (role in ('student', 'lecturer', 'admin')),
  status text not null default 'active' check (status in ('invited', 'active', 'deactivated')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (tenant_id, email)
);
create index users_tenant_role on users (tenant_id, role, status);

create table login_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  ip text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index login_codes_lookup on login_codes (tenant_id, email, created_at desc);
create index login_codes_ip on login_codes (ip, created_at desc);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text not null default '',
  ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on sessions (user_id);

-- Courses -----------------------------------------------------------------------------------------------------------

-- Frozen copies of the industry archetypes. A course grades against the snapshot it was created with, so the weekly
-- SEC refresh never changes a mark. Not personal data, shared by every university.
create table archetype_snapshots (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text not null check (length(code) between 1 and 30),
  title text not null check (length(title) between 2 and 120),
  term text not null default '',
  modules text[] not null check (cardinality(modules) between 1 and 12),
  due_at timestamptz,
  late_policy text not null default 'flag' check (late_policy in ('flag', 'block')),
  join_code text not null,
  join_open boolean not null default true,
  snapshot_id text not null references archetype_snapshots(id),
  archived boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, join_code)
);

create table course_staff (
  tenant_id uuid not null references tenants(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (course_id, user_id)
);

create table enrolments (
  tenant_id uuid not null references tenants(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  extension_until timestamptz,
  primary key (course_id, user_id)
);
create index enrolments_user on enrolments (user_id);

-- One row per student, course and module: the existing ModuleProgress JSON, with a version for safe autosave.
create table module_progress (
  tenant_id uuid not null references tenants(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  module_id text not null,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (course_id, user_id, module_id)
);

-- The latest hand-in per student and course. Handing in again replaces it and counts the attempt.
-- grades stays null until the background grader has replayed the decisions.
create table submissions (
  tenant_id uuid not null references tenants(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  payload jsonb not null,
  -- The course as printed on the PDF (title, code, lecturer, due date) at hand-in, so later edits never change the PDF.
  course_info jsonb not null,
  code text not null,
  handed_in_at timestamptz not null default now(),
  late boolean not null default false,
  attempt integer not null default 1,
  snapshot_id text not null references archetype_snapshots(id),
  grades jsonb,
  grade_error text,
  grading_claimed_at timestamptz,
  primary key (course_id, user_id)
);
create index submissions_ungraded on submissions (handed_in_at) where grades is null and grade_error is null;

-- Audit ---------------------------------------------------------------------------------------------------------------

create table audit_log (
  id bigserial primary key,
  tenant_id uuid references tenants(id) on delete set null,
  actor_kind text not null check (actor_kind in ('platform', 'user', 'system')),
  actor_id uuid,
  actor_email text,
  action text not null,
  target text,
  detail jsonb not null default '{}',
  ip text,
  at timestamptz not null default now()
);
create index audit_tenant_at on audit_log (tenant_id, at desc);

-- Platform admins (you) -------------------------------------------------------------------------------------------------

create table platform_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text not null default '',
  totp_secret text,
  totp_enabled_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table platform_login_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  ip text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index platform_login_codes_lookup on platform_login_codes (email, created_at desc);

create table platform_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references platform_admins(id) on delete cascade,
  token_hash text not null unique,
  mfa_at timestamptz,
  user_agent text not null default '',
  ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Row-level security ----------------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['tenant_domains', 'users', 'login_codes', 'sessions', 'courses', 'course_staff', 'enrolments', 'module_progress', 'submissions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (app_is_platform() or tenant_id = app_tenant()) with check (app_is_platform() or tenant_id = app_tenant())', t);
  end loop;
  foreach t in array array['platform_admins', 'platform_login_codes', 'platform_sessions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy platform_only on %I using (app_is_platform()) with check (app_is_platform())', t);
  end loop;
end $$;

alter table tenants enable row level security;
alter table tenants force row level security;
create policy tenant_self on tenants using (app_is_platform() or id = app_tenant()) with check (app_is_platform() or id = app_tenant());

alter table audit_log enable row level security;
alter table audit_log force row level security;
create policy audit_read on audit_log for select using (app_is_platform() or tenant_id = app_tenant());
create policy audit_write on audit_log for insert with check (app_is_platform() or tenant_id = app_tenant());
