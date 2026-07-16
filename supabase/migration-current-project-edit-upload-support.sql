-- Supplemental migration for the current uploaded project.
-- Safe to run more than once. If you already ran migration-edit-stations-and-storage.sql,
-- this mostly verifies the required table, grants, and public storage bucket.

create extension if not exists pgcrypto;

alter table public.stations
  add column if not exists clue_requires_solution boolean not null default false,
  add column if not exists clue_prompt_text text,
  add column if not exists clue_prompt_image_url text,
  add column if not exists clue_answer_keys text[] not null default '{}'::text[],
  add column if not exists hint_prompt_text text,
  add column if not exists hint_prompt_image_url text,
  add column if not exists hint_answer_key text,
  add column if not exists hint_text text,
  add column if not exists hint_image_url text,
  add column if not exists hint_penalty integer not null default 0;

create table if not exists public.clue_unlocks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(team_id, station_id)
);

create index if not exists idx_clue_unlocks_team on public.clue_unlocks(team_id);
create index if not exists idx_clue_unlocks_station on public.clue_unlocks(station_id);

alter table public.clue_unlocks enable row level security;

grant usage on schema public to service_role;
grant all on table public.clue_unlocks to service_role;
revoke all on table public.clue_unlocks from anon, authenticated;

insert into storage.buckets (id, name, public)
values ('hunt-images', 'hunt-images', true)
on conflict (id) do update set public = true;
