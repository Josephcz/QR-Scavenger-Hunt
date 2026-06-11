# QR Scavenger Hunt

A basic Vercel/Next.js scavenger hunt app backed by Supabase.

## Current game logic

- Teams register with a team name.
- The browser stores the team id/device key in local storage.
- Admins can recover a team using the recovery code shown in `/admin`.
- QR URLs use `/?c=<station_code>&t=<scan_token>`.
- Scanning the correct next QR code immediately awards that station's points.
- The revealed station page is only the clue/info for the next location.
- If a team scans an older QR code, they are sent back to their current revealed clue.
- If a team scans a future QR code, they are also sent back to their current revealed clue.
- The final active station, determined by highest `sort_order`, shows the congratulations screen and leaderboard.
- Optional extra hints can be puzzle-gated: players may need to type the correct unlock string before seeing the actual hint.
- Unlocking a hint can subtract points once. Showing the same hint again does not subtract again.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with your Supabase project values:

```env
NEXT_PUBLIC_EVENT_NAME="QR Scavenger Hunt"

SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"

SCAVENGER_ADMIN_PASSWORD="change-me"
```

Use the Supabase **service role** key, not the anon key. Keep it server-side only.

## Database setup

For a new Supabase project, run:

```txt
supabase/schema.sql
```

For an existing database from the previous version, run:

```txt
supabase/migration-current-clue-puzzle-hints.sql
```

This migration drops the old `station_scans` table, adds the puzzle-hint columns, and replaces the SQL functions.

Optional demo stations:

```txt
supabase/seed.sql
```

## Admin

Open:

```txt
/admin
```

QR URLs in the admin dashboard are generated from the current request domain, so they will use localhost locally and your real domain after deployment.

The admin page lets you:

- view recovery codes
- view the leaderboard
- copy QR URLs
- create stations
- add revealed clue text/images
- add optional puzzle-gated extra hints

## Station fields

Each station has:

- `sort_order`: the sequence number
- `code`: public station code in the QR URL
- `scan_token`: hidden-ish QR token in the QR URL
- `title`: title shown after scanning
- `body_markdown`: revealed clue/info for the next station
- `image_url`: optional revealed image
- `points`: points awarded when this QR is scanned in sequence
- `hint_prompt_text`: optional puzzle prompt shown before unlocking the extra hint
- `hint_prompt_image_url`: optional image shown before unlocking the extra hint
- `hint_answer_key`: optional required string to unlock the extra hint
- `hint_text`: actual extra hint text shown after unlock
- `hint_image_url`: actual extra hint image shown after unlock
- `hint_penalty`: points subtracted once when the hint is first unlocked

## Notes

The project uses Next.js Pages Router so it works with a `pages/` directory and `pages/api/*` API routes. It does not require the newer App Router.

Run a production build with:

```bash
npm run build
```
