alter table public.tasks
  add column if not exists agent_name text;

create index if not exists tasks_run_agent_idx on public.tasks(owner_id, run_id, agent_name);
