-- Adds a zero-point, no-QR start clue (station 0).
-- Safe to run after migration-edit-stations-and-storage.sql.

begin;

-- Earlier schemas required station order > 0. Station 0 is now a real clue row
-- used on the base hunt URL before any QR station has been completed.
alter table public.stations
  drop constraint if exists stations_sort_order_check;

alter table public.stations
  add constraint stations_sort_order_check
  check (sort_order >= 0);

-- Station 0 is informational only and must never award scan points or have
-- QR credentials. Normal stations continue to require both fields.
alter table public.stations alter column code drop not null;
alter table public.stations alter column scan_token drop not null;

update public.stations
set points = 0,
    code = null,
    scan_token = null,
    is_active = true,
    updated_at = now()
where sort_order = 0;

alter table public.stations
  drop constraint if exists stations_start_points_check;

alter table public.stations
  add constraint stations_start_points_check
  check (sort_order <> 0 or points = 0);

alter table public.stations
  drop constraint if exists stations_qr_identity_check;

alter table public.stations
  add constraint stations_qr_identity_check
  check (
    (sort_order = 0 and code is null and scan_token is null)
    or (sort_order > 0 and code is not null and scan_token is not null)
  );

commit;

-- IMPORTANT: this migration intentionally does not create station 0 because its
-- title/clue/image are event-specific. Create station order 0 from /admin after
-- running this migration. Existing station 1 remains the first QR to scan.
