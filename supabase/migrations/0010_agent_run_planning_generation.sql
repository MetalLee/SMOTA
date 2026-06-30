alter table public.agent_runs
  add column if not exists planning_generation integer not null default 0;
