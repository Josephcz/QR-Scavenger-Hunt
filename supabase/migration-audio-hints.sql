-- Adds optional paid audio hints to the current QR Scavenger Hunt schema.
-- Safe to run after the existing station-zero and edit/storage migrations.

alter table public.stations
  add column if not exists hint_audio_url text;

-- Files are public for browser playback, but the app only returns this URL
-- through the server-side paid-hint endpoint after hint usage is checked/recorded.
insert into storage.buckets (id, name, public)
values ('hunt-audio', 'hunt-audio', true)
on conflict (id) do update set public = true;
