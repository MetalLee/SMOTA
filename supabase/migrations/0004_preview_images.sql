alter table public.sandbox_runs
  add column if not exists preview_image_url text;
