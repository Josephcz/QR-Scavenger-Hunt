-- QR Scavenger Hunt Supabase schema
-- Current-clue + puzzle-gated hints version. Run this in Supabase SQL Editor before deploying the app.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  recovery_code text not null unique,
  device_key text not null,
  total_score integer not null default 0,
  completed_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null unique check (sort_order > 0),
  code text not null unique,
  scan_token text not null unique,
  title text not null,
  body_markdown text not null default '',
  image_url text,
  -- Legacy fields kept for compatibility with earlier versions. The current app awards points on scan.
  question_text text not null default '',
  answer_key text,
  points integer not null default 10,
  -- Optional puzzle-gated extra hint. The prompt/image are shown before unlock; hint_text/image are shown after unlock.
  hint_prompt_text text,
  hint_prompt_image_url text,
  hint_answer_key text,
  hint_text text,
  hint_image_url text,
  hint_penalty integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.station_completions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  awarded_points integer not null default 0,
  created_at timestamptz not null default now(),
  unique(team_id, station_id)
);

create table if not exists public.hint_usages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  penalty_points integer not null default 0,
  created_at timestamptz not null default now(),
  unique(team_id, station_id)
);

create index if not exists idx_stations_sort_order on public.stations(sort_order);
create index if not exists idx_station_completions_team on public.station_completions(team_id);
create index if not exists idx_hint_usages_team on public.hint_usages(team_id);

alter table public.teams enable row level security;
alter table public.stations enable row level security;
alter table public.station_completions enable row level security;
alter table public.hint_usages enable row level security;

-- This app uses only server-side Vercel API routes with the Supabase service-role key.
-- No anon/authenticated RLS policies are needed.

create or replace function public.complete_station(
  p_team_id uuid,
  p_station_id uuid,
  p_station_order integer,
  p_points integer
)
returns table(score integer, already_completed boolean, completed_order integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_order integer;
  v_score integer;
begin
  select t.completed_order, t.total_score
    into v_completed_order, v_score
  from public.teams as t
  where t.id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found';
  end if;

  if exists (
    select 1
    from public.station_completions as sc
    where sc.team_id = p_team_id
      and sc.station_id = p_station_id
  ) then
    return query select v_score, true, v_completed_order;
    return;
  end if;

  if v_completed_order <> p_station_order - 1 then
    raise exception 'Out of sequence';
  end if;

  insert into public.station_completions(team_id, station_id, awarded_points)
  values (p_team_id, p_station_id, p_points);

  update public.teams as t
  set total_score = t.total_score + p_points,
      completed_order = greatest(t.completed_order, p_station_order),
      updated_at = now()
  where t.id = p_team_id
  returning t.total_score, t.completed_order
  into v_score, v_completed_order;

  return query select v_score, false, v_completed_order;
end;
$$;

create or replace function public.use_hint(
  p_team_id uuid,
  p_station_id uuid,
  p_penalty integer
)
returns table(score integer, already_used boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score integer;
begin
  select t.total_score
    into v_score
  from public.teams as t
  where t.id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found';
  end if;

  if exists (
    select 1
    from public.hint_usages as hu
    where hu.team_id = p_team_id
      and hu.station_id = p_station_id
  ) then
    return query select v_score, true;
    return;
  end if;

  insert into public.hint_usages(team_id, station_id, penalty_points)
  values (p_team_id, p_station_id, p_penalty);

  update public.teams as t
  set total_score = t.total_score - p_penalty,
      updated_at = now()
  where t.id = p_team_id
  returning t.total_score
  into v_score;

  return query select v_score, false;
end;
$$;

-- Optional public Storage bucket for hint/station images.
-- You can also create this manually in Supabase Storage and make it public.
insert into storage.buckets (id, name, public)
values ('hunt-images', 'hunt-images', true)
on conflict (id) do update set public = true;

-- Do not expose mutation functions through anon/authenticated Supabase REST clients.
revoke all on function public.complete_station(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.use_hint(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.complete_station(uuid, uuid, integer, integer) to service_role;
grant execute on function public.use_hint(uuid, uuid, integer) to service_role;
