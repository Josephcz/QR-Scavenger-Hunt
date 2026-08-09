-- Optional arrival/place information shown after reaching a station and before its clue.
-- Safe to run after the previous station-zero / clue-gate / media migrations.

alter table public.stations
  add column if not exists arrival_title text,
  add column if not exists arrival_text text,
  add column if not exists arrival_image_url text;

create table if not exists public.station_arrival_views (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(team_id, station_id)
);

create index if not exists idx_station_arrival_views_team on public.station_arrival_views(team_id);
create index if not exists idx_station_arrival_views_station on public.station_arrival_views(station_id);

alter table public.station_arrival_views enable row level security;
grant all on table public.station_arrival_views to service_role;
revoke all on table public.station_arrival_views from anon, authenticated;
