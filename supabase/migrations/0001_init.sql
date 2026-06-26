create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  prompt text not null default '',
  app_type text not null default 'Web App',
  mode text not null default 'plan-first',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  mode text not null default 'plan-first',
  user_prompt text not null,
  status text not null default 'pending_approval',
  current_step text,
  runner_provider text not null default 'vercel_sandbox',
  sandbox_name text,
  sandbox_status text,
  sandbox_runtime text not null default 'node24',
  sandbox_timeout_ms integer,
  sandbox_preview_url text,
  build_status text,
  build_error text,
  fix_attempted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  agent_name text not null,
  step_name text not null,
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  type text not null,
  title text not null,
  path text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  path text not null,
  file_type text,
  change_type text,
  size integer,
  last_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.run_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  agent_name text,
  event_type text not null,
  step text,
  message text,
  stream text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, key)
);

create table public.sandbox_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  sandbox_name text,
  status text not null default 'pending',
  runtime text not null default 'node24',
  timeout_ms integer,
  publish_port integer not null default 5173,
  preview_url text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects(owner_id);
create index agent_runs_owner_project_idx on public.agent_runs(owner_id, project_id);
create index artifacts_run_idx on public.artifacts(owner_id, run_id);
create index tasks_run_idx on public.tasks(owner_id, run_id);
create index run_events_run_idx on public.run_events(owner_id, run_id, created_at);
create index workspace_files_project_idx on public.workspace_files(owner_id, project_id, path);
create index sandbox_runs_run_idx on public.sandbox_runs(owner_id, run_id);

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger agent_runs_set_updated_at before update on public.agent_runs for each row execute function public.set_updated_at();
create trigger agent_steps_set_updated_at before update on public.agent_steps for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger artifacts_set_updated_at before update on public.artifacts for each row execute function public.set_updated_at();
create trigger workspace_files_set_updated_at before update on public.workspace_files for each row execute function public.set_updated_at();
create trigger run_events_set_updated_at before update on public.run_events for each row execute function public.set_updated_at();
create trigger settings_set_updated_at before update on public.settings for each row execute function public.set_updated_at();
create trigger sandbox_runs_set_updated_at before update on public.sandbox_runs for each row execute function public.set_updated_at();
