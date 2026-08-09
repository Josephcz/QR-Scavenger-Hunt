-- Expands optional station audio beyond paid hints.
-- Safe to run after migration-audio-hints.sql.

alter table public.stations
  add column if not exists audio_url text,
  add column if not exists clue_prompt_audio_url text,
  add column if not exists hint_audio_url text;

-- One public bucket is shared by clue, prompt, and paid-hint audio.
-- Access to paid-hint URLs is still controlled by the application API: the URL
-- is not returned in the ordinary station payload until the hint endpoint allows it.
insert into storage.buckets (id, name, public)
values ('hunt-audio', 'hunt-audio', true)
on conflict (id) do update set public = true;
