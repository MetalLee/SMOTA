alter table public.projects
  add column if not exists is_shared_to_discovery boolean not null default true,
  add column if not exists shared_at timestamptz,
  add column if not exists source_project_id uuid references public.projects(id) on delete set null;

create table if not exists public.project_favorites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(owner_id, project_id)
);

create table if not exists public.project_share_stats (
  project_id uuid primary key references public.projects(id) on delete cascade,
  view_count integer not null default 0,
  clone_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.project_favorites enable row level security;
alter table public.project_share_stats enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'projects_select_shared'
  ) then
    create policy "projects_select_shared" on public.projects
      for select using (owner_id = auth.uid() or is_shared_to_discovery = true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_favorites'
      and policyname = 'project_favorites_select_own'
  ) then
    create policy "project_favorites_select_own" on public.project_favorites for select using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_favorites'
      and policyname = 'project_favorites_insert_own'
  ) then
    create policy "project_favorites_insert_own" on public.project_favorites for insert with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_favorites'
      and policyname = 'project_favorites_delete_own'
  ) then
    create policy "project_favorites_delete_own" on public.project_favorites for delete using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_share_stats'
      and policyname = 'project_share_stats_select_shared'
  ) then
    create policy "project_share_stats_select_shared" on public.project_share_stats
      for select using (
        exists (
          select 1 from public.projects
          where projects.id = project_share_stats.project_id
            and (projects.owner_id = auth.uid() or projects.is_shared_to_discovery = true)
        )
      );
  end if;
end;
$$;

create index if not exists projects_discovery_idx on public.projects(is_shared_to_discovery, shared_at desc);
create index if not exists projects_source_project_idx on public.projects(source_project_id);
create index if not exists project_favorites_owner_idx on public.project_favorites(owner_id, created_at desc);

create or replace function public.increment_project_view_count(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.projects
    where id = target_project_id
      and (is_shared_to_discovery = true or owner_id = auth.uid())
  ) then
    return;
  end if;

  insert into public.project_share_stats(project_id, view_count, clone_count, updated_at)
  values (target_project_id, 1, 0, now())
  on conflict (project_id) do update
    set view_count = public.project_share_stats.view_count + 1,
        updated_at = now();
end;
$$;

create or replace function public.increment_project_clone_count(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.projects
    where id = target_project_id
      and (is_shared_to_discovery = true or owner_id = auth.uid())
  ) then
    return;
  end if;

  insert into public.project_share_stats(project_id, view_count, clone_count, updated_at)
  values (target_project_id, 0, 1, now())
  on conflict (project_id) do update
    set clone_count = public.project_share_stats.clone_count + 1,
        updated_at = now();
end;
$$;
