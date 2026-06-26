alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_steps enable row level security;
alter table public.tasks enable row level security;
alter table public.artifacts enable row level security;
alter table public.workspace_files enable row level security;
alter table public.run_events enable row level security;
alter table public.settings enable row level security;
alter table public.sandbox_runs enable row level security;

create policy "profiles_select_own" on public.profiles for select using (owner_id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (owner_id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "profiles_delete_own" on public.profiles for delete using (owner_id = auth.uid());

create policy "projects_select_own" on public.projects for select using (owner_id = auth.uid());
create policy "projects_insert_own" on public.projects for insert with check (owner_id = auth.uid());
create policy "projects_update_own" on public.projects for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "projects_delete_own" on public.projects for delete using (owner_id = auth.uid());

create policy "agent_runs_select_own" on public.agent_runs for select using (owner_id = auth.uid());
create policy "agent_runs_insert_own" on public.agent_runs for insert with check (owner_id = auth.uid());
create policy "agent_runs_update_own" on public.agent_runs for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "agent_runs_delete_own" on public.agent_runs for delete using (owner_id = auth.uid());

create policy "agent_steps_select_own" on public.agent_steps for select using (owner_id = auth.uid());
create policy "agent_steps_insert_own" on public.agent_steps for insert with check (owner_id = auth.uid());
create policy "agent_steps_update_own" on public.agent_steps for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "agent_steps_delete_own" on public.agent_steps for delete using (owner_id = auth.uid());

create policy "tasks_select_own" on public.tasks for select using (owner_id = auth.uid());
create policy "tasks_insert_own" on public.tasks for insert with check (owner_id = auth.uid());
create policy "tasks_update_own" on public.tasks for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "tasks_delete_own" on public.tasks for delete using (owner_id = auth.uid());

create policy "artifacts_select_own" on public.artifacts for select using (owner_id = auth.uid());
create policy "artifacts_insert_own" on public.artifacts for insert with check (owner_id = auth.uid());
create policy "artifacts_update_own" on public.artifacts for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "artifacts_delete_own" on public.artifacts for delete using (owner_id = auth.uid());

create policy "workspace_files_select_own" on public.workspace_files for select using (owner_id = auth.uid());
create policy "workspace_files_insert_own" on public.workspace_files for insert with check (owner_id = auth.uid());
create policy "workspace_files_update_own" on public.workspace_files for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "workspace_files_delete_own" on public.workspace_files for delete using (owner_id = auth.uid());

create policy "run_events_select_own" on public.run_events for select using (owner_id = auth.uid());
create policy "run_events_insert_own" on public.run_events for insert with check (owner_id = auth.uid());
create policy "run_events_update_own" on public.run_events for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "run_events_delete_own" on public.run_events for delete using (owner_id = auth.uid());

create policy "settings_select_own" on public.settings for select using (owner_id = auth.uid());
create policy "settings_insert_own" on public.settings for insert with check (owner_id = auth.uid());
create policy "settings_update_own" on public.settings for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "settings_delete_own" on public.settings for delete using (owner_id = auth.uid());

create policy "sandbox_runs_select_own" on public.sandbox_runs for select using (owner_id = auth.uid());
create policy "sandbox_runs_insert_own" on public.sandbox_runs for insert with check (owner_id = auth.uid());
create policy "sandbox_runs_update_own" on public.sandbox_runs for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sandbox_runs_delete_own" on public.sandbox_runs for delete using (owner_id = auth.uid());
