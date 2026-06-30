create table if not exists public.sandbox_workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  status text not null default 'queued',
  current_phase text,
  attempt_count integer not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id)
);

create index if not exists sandbox_workflow_jobs_owner_run_idx
  on public.sandbox_workflow_jobs(owner_id, run_id);

create index if not exists sandbox_workflow_jobs_status_lease_idx
  on public.sandbox_workflow_jobs(status, lease_expires_at);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'sandbox_workflow_jobs_set_updated_at'
      and tgrelid = 'public.sandbox_workflow_jobs'::regclass
  ) then
    create trigger sandbox_workflow_jobs_set_updated_at
      before update on public.sandbox_workflow_jobs
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.sandbox_workflow_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sandbox_workflow_jobs'
      and policyname = 'sandbox_workflow_jobs_select_own'
  ) then
    create policy "sandbox_workflow_jobs_select_own" on public.sandbox_workflow_jobs for select using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sandbox_workflow_jobs'
      and policyname = 'sandbox_workflow_jobs_insert_own'
  ) then
    create policy "sandbox_workflow_jobs_insert_own" on public.sandbox_workflow_jobs for insert with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sandbox_workflow_jobs'
      and policyname = 'sandbox_workflow_jobs_update_own'
  ) then
    create policy "sandbox_workflow_jobs_update_own" on public.sandbox_workflow_jobs for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sandbox_workflow_jobs'
      and policyname = 'sandbox_workflow_jobs_delete_own'
  ) then
    create policy "sandbox_workflow_jobs_delete_own" on public.sandbox_workflow_jobs for delete using (owner_id = auth.uid());
  end if;
end $$;
