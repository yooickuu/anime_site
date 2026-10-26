# Social features: staged architecture

## Stage 1 — profiles and episode comments

Apply `supabase/social-01.sql` after the existing nickname migration. New public
projection tables contain only nickname, bio, public image paths, four aggregate
statistics and opt-in viewing history. Never expose `auth.users`, `yoru_state`,
private avatar storage, email, preferences or auth metadata to visitors.

Existing names are mirrored from the unique nickname registry. Existing private
history/photos are not automatically published. The owner publishes profile art
explicitly and chooses whether viewing history is public. Statistics and history
are computed from private state on the server, not accepted from the client.

Comments use `(anime_id, season, episode)` from the actual episode manifest (not
array index). Responses belong to the same episode via a composite foreign key.
One reply level keeps mobile threads manageable. A deleted parent remains as a
placeholder; deleting/editing is author-only. Guests can read; all mutations require
a registered non-anonymous Supabase session. Posting has a per-user rate limit.

## Stage 2 — friends and messages

Apply `supabase/social-02.sql`. Friendship requests have a unique unordered user
pair; only the addressee accepts/rejects. DMs are unique for a friend pair. Groups
contain at most 20 members, invited from the owner's accepted friends. Members
may leave; an owner may remove members and rename the group.

Only members can read conversations, membership, messages and chat images. Writes
use authenticated RPCs with ownership/membership checks and rate limits. Photos
are resized/re-encoded to remove metadata, stored in a private image-only bucket,
and accessed with short-lived signed URLs. Anime shares contain only a catalogue
ID; the UI loads the matching light card instead of storing HTML or a whole anime.

## Client isolation and memory

`src/social/entry.js` is a lazy facade. Comments, profiles and messenger are separate
ES modules. Supabase is injected from the existing application; no second client,
HLS library or catalogue bundle is imported. CSS loads only on first social use.
Comments load 20 roots/replies per page; messages 40 per page with at most 120 in
DOM. User search is debounced and capped at 20 results. Chat polling runs only for
an open visible conversation and stops on close, navigation or account change.
No background polling or social fetches on home startup. Images have size limits.

## Rollout and checks

1. Test both migrations twice on an isolated PostgreSQL-compatible PGlite database.
2. Exercise anon, Alice, Bob and unrelated Eve: reads/writes, spoofed authors,
   cross-episode replies, friendship acceptance, membership and attachment paths.
3. Run client tests and build. Check esbuild inputs exclude social modules, heavy
   catalogue JSON and PGlite from the startup app; record bundle sizes.
4. Apply migrations via setup and deploy the updated existing `delete-account`
   function to remove social uploads on account deletion. Then test actual
   authenticated interactions and private storage before calling rollout complete.

The existing video resolver, HLS integration, proxy v17, catalogue and private
state schema are outside this change. No migration drops existing account data.
Security follows Supabase's RLS and private Storage model:
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/storage/serving/downloads
