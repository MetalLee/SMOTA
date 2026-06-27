create unique index if not exists workspace_files_run_path_unique_idx
  on public.workspace_files(owner_id, project_id, run_id, path);
