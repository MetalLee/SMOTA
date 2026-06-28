alter table public.agent_runs
  add column if not exists parent_run_id uuid references public.agent_runs(id) on delete set null;

create index if not exists agent_runs_parent_run_id_idx
  on public.agent_runs(parent_run_id);
