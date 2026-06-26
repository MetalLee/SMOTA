alter table public.run_events
  add column if not exists payload jsonb not null default '{}'::jsonb;

create unique index if not exists sandbox_runs_run_id_unique_idx
  on public.sandbox_runs(run_id);
