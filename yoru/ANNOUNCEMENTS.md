# Announcement catalogue

Announcements are metadata only. They live in `src/announcements.json`, are published as `data/announcements.json`, and load through the separate `providers/announcements.js` module. They never enter the approved video catalogue or initial bundle. Existing user lists/Auth/HLS are unchanged.

`node scripts/update-announcements.mjs` collects up to 500 popular upcoming titles from Shikimori and AniList. It retains disappeared announcements for status rechecks, matches published titles by exact IDs (or an unambiguous normalized title/year/format without conflicting IDs), and queries Kodik for actual episodes. A new video title must pass the existing assembler/admission checks. Up to three distinct dubs are merged; no fabricated tracks or episode counts. Admission uses the existing `mal-N`/`shikimori-N` identity. Alternative announcement IDs have read-only aliases, preserving saved references.

A premiere date or metadata status alone cannot enable playback. Released-but-unavailable titles are metadata-only and stay queued. Only a validated, published manifest enables Watch. Provider/network failures preserve existing catalogue data and retry at the next run. Concurrent catalogue writes are detected before saving.

The existing six-hour workflow runs the updater after normal ongoing refresh. Announcement API failures do not block publishing ongoing episodes. The workflow includes announcement source data, generated feed and lazy module in its commit and Pages artifact. `checks/announcements.json` is included in the workflow report artifact.

Client cache is bounded (600 metadata cards, no streams) with a 12-hour TTL and a build revision. Search uses Shikimori with AniList fallback, deduplicates against the published search index, and never changes private saved lists. No new Supabase migration or Edge Function deployment is required.
