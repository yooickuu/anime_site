# Optional English playback

English Dub / English Sub are on-demand choices, not catalogue records. The adapter
loads only when selected. English Sub is Japanese audio with an English WebVTT track
(or the Gogoanime provider's hardcoded sub release). No Kodik token or login/session
is sent to these servers. The Kodik resolver, proxy v17 and playback transport are unchanged.

The default instances are those supplied by the site owner:

- https://consumet-api-clone.vercel.app/
- https://api.consumet.stream/

To replace them, set `window.YORU_CONFIG.consumetApiUrls` to an array of HTTPS base
URLs in the existing public `config.js`. No secret belongs in this setting.
The first is primary, the second is tried after errors/timeouts. Each server/provider
gets its own info request; episode IDs are never transferred between servers.

MAL IDs are resolved to AniList IDs using AniList GraphQL, then the returned info
must match both IDs. Do not trust pre-existing catalogue AniList IDs without this
check. Missing episodes/dubs, season-zero and ambiguous combined-season records
are unavailable, rather than replaced with an unrelated first episode.

The browser checks HLS and VTT accessibility with real CORS rules. A URL that needs
forged request headers or a different media proxy is not considered playable.
This module does not add arbitrary third-party URLs to the Kodik proxy.
Only verified HLS links are offered; an adaptive master is labelled Auto.

Deployment check (26 October 2026): the primary root and metadata route respond,
but Zoro info returned 504 and Gogoanime info returned 500. The fallback hostname
failed DNS resolution. Thus live English video could NOT be verified. Passing
fixture tests verifies failover/mapping/cleanup, not upstream service availability.
A working Consumet deployment with working providers and browser-accessible media
is still necessary. On failure the existing video UI offers Retry and Russian audio.

Official route reference:
https://github.com/consumet/docs.consumet.org/tree/master/pages/rest-api/Meta/anilist-anime
