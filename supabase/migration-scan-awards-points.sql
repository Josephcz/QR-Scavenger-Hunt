-- Migration for existing QR Scavenger Hunt databases.
-- Changes:
-- 1. Removes station_scans; station_completions is now the only scan proof.
-- 2. Adds optional puzzle-gated extra hints.
-- 3. Replaces functions with qualified-column, service-role-only versions.

alter table public.stations
  add column if not exists hint_prompt_text text,
  add column if not exists hint_prompt_image_url text,
  add column if not exists hint_answer_key text;

drop table if exists public.station_scans cascade;

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

revoke all on function public.complete_station(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.use_hint(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.complete_station(uuid, uuid, integer, integer) to service_role;
grant execute on function public.use_hint(uuid, uuid, integer) to service_role;
