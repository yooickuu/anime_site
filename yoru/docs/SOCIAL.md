# Social features: staged architecture

## Stage 1 — profiles and episode comments

Apply `supabase/social-01.sql` after the existing nickname migration. New public
projection tables contain only nickname, bio, public image paths, four aggregate
statistics and opt-in viewing history. Never expose `auth.users`, `yoru_state`,
private avatar storage, email, preferences or auth metadata to visitors.

Existing names are mirrored from the unique nickname registry. Stage 3 (`social-03.sql`) makes the main account preferences the sole profile
source. The separate editor is retired. On an owner profile visit/update, the lazy
sync module copies only that owner's selected avatar/banner from private storage
to the public media bucket under the same immutable paths. Bio, privacy and stats
are projected from server-side private state. Main profile displays the visibility
notice; email is never copied. Old account images remain in the private bucket.
History remains opt-in; Hide/Show lives beside the main profile history heading.
The public history RPC returns only anime ID and calendar date. Direct history
reads are owner-only, even for signed-in nonowners; the UI resolves art/title
from bounded catalogue cards and never shows episode or exact time to visitors.

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

## UI refresh — 27 October
- Header Chats route: `#social/chats`; main profile contains Find people/Friends.
- Text entry fields have a 16px minimum without disabling pinch zoom. Desktop
  Enter sends; Shift+Enter, composing text and touch keyboards retain newlines.
- Comments mount automatically below playback settings when near the viewport.
- Chat rows reuse DOM nodes and image URLs; only new bubbles animate. No polling
  on home; reduced-motion preference disables the new animations.
- Mobile PiP uses the Safari system presentation API and replaces the cinema
  toolbar slot when supported; media resolution/proxy/HLS code is unchanged.
- User applied stage 3; real REST denies guest detailed history (401), date-only
  RPC returns200. Manual real-iPhone PiP/keyboard QA still required.
