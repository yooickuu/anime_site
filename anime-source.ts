// server/network-retry.js
var pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function retryableNetworkError(error) {
  return ["TimeoutError", "TypeError"].includes(error?.name) || /network|fetch failed|unexpected EOF|connection (?:reset|closed)|http2|timed? ?out|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(error?.message || "");
}
async function networkRetry(operation, { wait = pause, signal } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (signal?.aborted || attempt === 2 || !retryableNetworkError(error)) throw error;
      await wait(1500);
    }
  }
}

// server/animego.js
function positiveID(n) {
  return Number.isSafeInteger(Number(n)) && Number(n) > 0 && Number(n) < 1e8;
}
function decodeStream(value) {
  if (/^https?:|^\/\//.test(value)) return value;
  const base64 = value.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(base + (c.charCodeAt(0) - base + 18) % 26);
  });
  return atob(base64);
}
function parseStreams(links = {}) {
  const result = [];
  for (const [q, list] of Object.entries(links)) {
    const quality = Number(q);
    if (![240, 360, 480, 720, 1080, 1440, 2160].includes(quality) || !Array.isArray(list)) continue;
    for (const item of list) {
      try {
        const u = new URL(decodeStream(item.src), "https://kodikplayer.com");
        if (u.protocol === "https:" && !u.username && !u.password && /\.m3u8(?:$|\?)/.test(u.href)) {
          result.push({ quality, url: u.href });
          break;
        }
      } catch {
      }
    }
  }
  return result.sort((a, b) => b.quality - a.quality);
}
var cache = /* @__PURE__ */ new Map();
async function cached(key, ttl, load) {
  const old = cache.get(key);
  if (old && old.until > Date.now()) return old.promise;
  const promise = load();
  cache.set(key, { until: Date.now() + ttl, promise });
  if (cache.size > 600) cache.delete(cache.keys().next().value);
  try {
    return await promise;
  } catch (e) {
    cache.delete(key);
    throw e;
  }
}
var upstreamClient;
function transportOptions() {
  if (typeof globalThis.Deno?.createHttpClient !== "function") return {};
  upstreamClient ??= globalThis.Deno.createHttpClient({ http1: true, http2: false, poolMaxIdlePerHost: 4 });
  return { client: upstreamClient };
}
async function textFetch(url, options = {}) {
  return networkRetry(() => readUpstream(url, options), { signal: options.signal });
}
async function readUpstream(url, options = {}) {
  const { onHeaders, ...requestOptions } = options;
  const allowed = /* @__PURE__ */ new Set([new URL(url).hostname, "kodikplayer.com", "kodik.info", "kodik.biz", "kodik.cc", "yomiku.site", "www.yomiku.site"]);
  let current = new URL(url), method = options.method || "GET", body = options.body;
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetch(current, { ...requestOptions, ...transportOptions(), method, body, headers: { "Accept-Encoding": "identity", "User-Agent": "yomiku/1.0 (+https://yomiku.site/)", ...options.headers }, redirect: "manual", signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(25e3)]) : AbortSignal.timeout(25e3) });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const location = r.headers.get("location");
      await r.body?.cancel();
      if (!location) throw Error("upstream_redirect_missing");
      const next = new URL(location, current);
      if (next.protocol !== "https:" || !allowed.has(next.hostname) || next.username || next.password || next.port) throw Error("upstream_redirect_blocked");
      if (r.status === 303 || [301, 302].includes(r.status) && method === "POST") {
        method = "GET";
        body = void 0;
      }
      current = next;
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw Error("upstream_" + r.status);
    }
    onHeaders?.(r.headers);
    const reader = r.body.getReader();
    let size = 0, parts = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 3e6) throw Error("upstream_too_large");
        parts.push(value);
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
      }
    }
    const bytes = new Uint8Array(size);
    let i = 0;
    for (const p of parts) {
      bytes.set(p, i);
      i += p.length;
    }
    return new TextDecoder().decode(bytes);
  }
  throw Error("upstream_redirect_loop");
}
async function jsonFetch(url, options = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await textFetch(url, options);
    try {
      return JSON.parse(text);
    } catch {
      if (attempt === 2) throw Error("upstream_invalid_json_" + text.length + "_" + (text.trim().startsWith("<") ? "html" : text.trim() ? "text" : "empty"));
    }
  }
}
async function kodikVideo(url, ordinal) {
  if (!validEmbed(url)) throw Error("invalid_embed");
  return cached("stream:" + url, 45e3, async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await resolveKodikPlayer(url, ordinal);
      } catch (error) {
        if (attempt === 2 || !/upstream_invalid_json|unexpected EOF/.test(error.message)) throw error;
      }
    }
  });
}
function kodikRequestParameters(params) {
  const body = {};
  for (const key of ["d", "d_sign", "pd", "pd_sign", "ref", "ref_sign"]) body[key] = params[key] || "";
  try {
    body.ref = decodeURIComponent(body.ref);
  } catch {
    throw Error("invalid_referrer_encoding");
  }
  return body;
}
async function resolveKodikPlayer(url, ordinal) {
  const cookies = /* @__PURE__ */ new Map();
  const onHeaders = (headers) => {
    for (const value of headers.getSetCookie?.() || []) {
      const pair = value.split(";")[0], i = pair.indexOf("=");
      if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  };
  const sessionHeaders = () => ({ "Cookie": [...cookies].map(([k, v]) => k + "=" + v).join(";"), "Cache-Control": "no-cache" });
  const html = await textFetch(url, { onHeaders, headers: { "Referer": "https://yomiku.site/", "Cache-Control": "no-cache" } });
  const params = JSON.parse(html.match(/var\s+urlParams\s*=\s*'([^']+)'/)?.[1] || "null");
  const script = html.match(/src="(\/assets\/js\/app\.player_single\.[a-z0-9]+\.js)"/)?.[1];
  if (!params || !script) throw Error("player_changed");
  const endpoint = await cached(script, 36e5, async () => {
    const js = await textFetch("https://kodikplayer.com" + script);
    const encoded = js.match(/type:"POST",url:atob\("([^"]+)"\)/)?.[1];
    if (!encoded) throw Error("player_changed");
    const path = atob(encoded);
    if (!/^\/[a-z0-9_-]+$/.test(path)) throw Error("invalid_endpoint");
    return path;
  });
  const body = kodikRequestParameters(params);
  for (const key of ["type", "id", "hash"]) {
    body[key] = html.match(new RegExp("vInfo\\." + key + "\\s*=\\s*'([^']+)'"))?.[1];
    if (!body[key]) throw Error("player_changed");
  }
  const data = await jsonFetch("https://kodikplayer.com" + endpoint, { method: "POST", onHeaders, headers: { ...sessionHeaders(), "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", "Referer": url, "Origin": "https://kodikplayer.com", "Accept": "application/json, text/javascript, */*; q=0.01" }, body: new URLSearchParams(body).toString() });
  const sources = parseStreams(data.links);
  if (!sources.length) throw Error("no_streams");
  return { sources, url: (sources.find((s) => s.quality === 720) || sources[0]).url, stream: true, ordinal: Number(ordinal), opening: null, ending: null };
}
function validEmbed(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "kodikplayer.com" && !u.port && !u.username && !u.password && /^\/(?:seria|serial|video)\/\d+\/[a-z0-9]+\//.test(u.pathname);
  } catch {
    return false;
  }
}
var SNAPSHOT_BASE = "https://yomiku.site/data/animego-episodes/";
function validateSnapshot(data, id) {
  if (!data || data.id !== Number(id) || !Array.isArray(data.episodes) || !Number.isInteger(data.total) || data.total < 1 || data.total > 1e4 || data.total !== data.episodes.length) throw Error("invalid_snapshot");
  const ordinals = /* @__PURE__ */ new Set();
  for (const e of data.episodes) {
    if (!Number.isFinite(e.ordinal) || e.ordinal < 0 || e.ordinal > 1e4 || ordinals.has(e.ordinal) || !positiveID(e.id) || !Array.isArray(e.voices) || e.voices.length > 100) throw Error("invalid_snapshot");
    ordinals.add(e.ordinal);
    const voices = /* @__PURE__ */ new Set();
    for (const v of e.voices) {
      if (!/^go-\d+$/.test(v.id) || voices.has(v.id) || !validEmbed(v.url) || typeof v.label !== "string" || v.label.length > 100 || !["ru", "ja"].includes(v.language)) throw Error("invalid_snapshot");
      voices.add(v.id);
    }
  }
  return data;
}
async function goSnapshot(id) {
  if (!positiveID(id)) throw Error("invalid_id");
  return cached("snapshot:" + id, 12e4, async () => validateSnapshot(JSON.parse(await textFetch(SNAPSHOT_BASE + id + ".json")), id));
}
async function snapshotRelease(id) {
  const d = await goSnapshot(id);
  return { episodes: d.episodes.map(({ id: id2, ordinal }) => ({ id: id2, ordinal })), voices: d.episodes[0].voices.map(({ url, ...v }) => v) };
}
async function snapshotVoices(id, ordinal) {
  const d = await goSnapshot(id), e = d.episodes.find((e2) => e2.ordinal === Number(ordinal));
  if (!e) throw Error("episode_missing");
  return e.voices;
}
async function snapshotVideo(id, ordinal, audio) {
  const v = (await snapshotVoices(id, ordinal)).find((v2) => v2.id === audio);
  if (!v) throw Error("audio_missing");
  return kodikVideo(v.url, ordinal);
}
async function snapshotHealth() {
  const d = await goSnapshot(4013), e = d.episodes[0], v = e.voices.find((v2) => v2.language === "ja") || e.voices[0];
  if (!v) throw Error("audio_missing");
  const video = await kodikVideo(v.url, e.ordinal);
  const manifest = await textFetch(video.url);
  if (!manifest.startsWith("#EXTM3U")) throw Error("invalid_manifest");
  return true;
}

// server/media-proxy.js
var manifestCache = /* @__PURE__ */ new Map();
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "Range", "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length", "X-Content-Type-Options": "nosniff" };
var encode = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
var decode = (value) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
function mediaURL(value, base) {
  const u = new URL(value, base);
  if (u.protocol !== "https:" || u.username || u.password || u.port || !(u.hostname === "solodcdn.com" || u.hostname.endsWith(".solodcdn.com"))) throw Error("media_host_not_allowed");
  if (u.href.length > 6e3) throw Error("media_url_too_long");
  return u;
}
function createMediaProxy({ secret, endpoint, fetcher = fetch, now = Date.now, cryptoAPI = crypto, cache: cache2 = manifestCache, wait }) {
  if (!secret) throw Error("proxy_not_configured");
  const key = cryptoAPI.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  async function sign(url, expires = Math.floor(now() / 1e3) + 7200) {
    const target = mediaURL(url).href, payload = encode(encoder.encode(JSON.stringify({ url: target, expires })));
    const signature = encode(new Uint8Array(await cryptoAPI.subtle.sign("HMAC", await key, encoder.encode(payload))));
    const result = new URL(endpoint);
    result.search = "";
    result.searchParams.set("stream", "1");
    result.searchParams.set("p", payload);
    result.searchParams.set("s", signature);
    return result.href;
  }
  async function verify(url) {
    const p = url.searchParams.get("p") || "", s = url.searchParams.get("s") || "";
    if (p.length > 9e3 || !s || !p) throw Error("invalid_media_signature");
    let data;
    try {
      if (!await cryptoAPI.subtle.verify("HMAC", await key, decode(s), encoder.encode(p))) throw Error();
      data = JSON.parse(decoder.decode(decode(p)));
    } catch {
      throw Error("invalid_media_signature");
    }
    if (!Number.isSafeInteger(data.expires) || data.expires <= now() / 1e3 || data.expires > now() / 1e3 + 7210) throw Error("media_signature_expired");
    return { ...data, url: mediaURL(data.url).href };
  }
  async function playlist(text, base, expires) {
    if (!text.trimStart().startsWith("#EXTM3U")) throw Error("invalid_media_playlist");
    return (await Promise.all(text.split(/\r?\n/).map(async (line) => {
      if (!line.trim()) return line;
      if (!line.startsWith("#")) return sign(mediaURL(line.trim(), base).href, expires);
      const matches = [...line.matchAll(/\bURI="([^"]+)"/g)];
      for (const m of matches) line = line.replace(m[0], `URI="${await sign(mediaURL(m[1], base).href, expires)}"`);
      return line;
    }))).join("\n");
  }
  async function upstream(url, request) {
    let target = mediaURL(url);
    const range = request.headers.get("range");
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw Error("invalid_media_range");
    for (let i = 0; i < 4; i++) {
      const response = await networkRetry(() => fetcher(target.href, { ...transportOptions(), method: request.method === "HEAD" ? "HEAD" : "GET", redirect: "manual", signal: AbortSignal.any([request.signal, AbortSignal.timeout(25e3)]), headers: { Referer: "https://kodik.cc/", Origin: "https://kodik.cc/", "Accept-Encoding": "identity", ...range ? { Range: range } : {} } }), { signal: request.signal, wait });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw Error("invalid_media_redirect");
        target = mediaURL(location, target);
        continue;
      }
      return { response, url: target.href };
    }
    throw Error("media_redirect_loop");
  }
  async function handle(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: cors });
    let token;
    try {
      token = await verify(new URL(request.url));
    } catch {
      return new Response("Invalid or expired media link", { status: 403, headers: { ...cors, "Cache-Control": "no-store" } });
    }
    try {
      const cacheKey = token.url;
      const cached2 = cache2.get(cacheKey);
      if (cached2 && cached2.until <= now()) cache2.delete(cacheKey);
      const ttl = Math.max(0, Math.min(600, Math.floor(token.expires - now() / 1e3)));
      if (cached2 && cached2.until > now() && !request.headers.has("range")) {
        const body = request.method === "HEAD" ? null : await playlist(cached2.text, cached2.url, token.expires);
        return new Response(body, { headers: { ...cors, "Content-Type": "application/x-mpegURL", "Cache-Control": `private, max-age=${Math.min(ttl, Math.floor((cached2.until - now()) / 1e3))}` } });
      }
      const { response: r, url } = await upstream(token.url, request);
      if (!r.ok) {
        await r.body?.cancel();
        return new Response(null, { status: [403, 404, 410, 416].includes(r.status) ? r.status : 502, headers: { ...cors, "Cache-Control": "no-store" } });
      }
      const isPlaylist = /\.m3u8(?:$|\?)/i.test(url) || /mpegurl/i.test(r.headers.get("content-type") || "");
      const headers = { ...cors, "Cache-Control": "private, max-age=30", "Content-Type": isPlaylist ? "application/x-mpegURL" : /\.ts(?:$|\?)/i.test(url) ? "video/mp2t" : /\.(?:m4s|mp4)(?:$|\?)/i.test(url) ? "video/mp4" : "application/octet-stream" };
      if (request.method === "HEAD") {
        await r.body?.cancel();
        return new Response(null, { status: r.status, headers });
      }
      if (isPlaylist) {
        const reader = r.body.getReader();
        let size = 0, parts = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 2e6) throw Error("media_playlist_too_large");
            parts.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {
          });
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of parts) {
          bytes.set(part, offset);
          offset += part.length;
        }
        const text = decoder.decode(bytes), rewritten = await playlist(text, url, token.expires);
        const cacheable = /#EXT-X-ENDLIST|#EXT-X-STREAM-INF:/.test(text) && !request.headers.has("range");
        headers["Cache-Control"] = cacheable ? `private, max-age=${ttl}` : "no-store";
        if (cacheable && size <= 262144) {
          cache2.set(cacheKey, { text, url, until: now() + 6e5 });
          while (cache2.size > 64) cache2.delete(cache2.keys().next().value);
        }
        return new Response(rewritten, { headers });
      }
      for (const name of ["content-range", "accept-ranges"]) if (r.headers.has(name)) headers[name] = r.headers.get(name);
      return new Response(r.body, { status: r.status, headers });
    } catch {
      return new Response("Media upstream unavailable", { status: 502, headers: { ...cors, "Cache-Control": "no-store" } });
    }
  }
  async function video(value) {
    const sources = await Promise.all(value.sources.map(async (s) => ({ ...s, url: await sign(s.url), stream: true })));
    return { ...value, sources, url: (sources.find((s) => s.quality === 720) || sources[0])?.url, stream: true, proxied: true };
  }
  return { sign, verify, playlist, handle, video };
}

// server/published-kodik.js
var manifestCache2 = /* @__PURE__ */ new Map();
async function fetchManifest(url) {
  try {
    const data = await jsonFetch(url);
    return { ok: true, json: async () => data };
  } catch (error) {
    throw Error("manifest_" + error.message);
  }
}
async function publishedKodikVideo(id, index, audio, { fetcher = fetchManifest, resolve = kodikVideo, season, ordinal } = {}) {
  if (!/^(mal|shikimori|lib)-\d+$/.test(id) || !Number.isSafeInteger(index) || index < 1 || !/^kodik-\d+$/.test(audio)) throw Error("invalid_request");
  let cached2 = manifestCache2.get(id);
  if (!cached2 || Date.now() > cached2.until) {
    const response = await fetcher(`https://raw.githubusercontent.com/yooickuu/anime_site/main/data/kodik/${id}.json`, { signal: AbortSignal.timeout(1e4) });
    if (!response.ok) throw Error("episode_missing");
    const data = await response.json();
    if (data.id !== id || !Array.isArray(data.episodes)) throw Error("invalid_manifest");
    cached2 = { data, until: Date.now() + 6e4 };
    manifestCache2.set(id, cached2);
    if (manifestCache2.size > 100) manifestCache2.delete(manifestCache2.keys().next().value);
  }
  const exact = Number.isFinite(ordinal) && Number.isInteger(season);
  const track = exact ? cached2.data.episodes.flatMap((e) => e.tracks || []).find((t) => t.audioId === audio && t.ordinal === ordinal && t.season === season) : cached2.data.episodes[index - 1]?.tracks?.find((t) => t.audioId === audio);
  if (!track || !validEmbed(track.url) || audio !== `kodik-${track.translationId}`) throw Error("audio_missing");
  let video;
  try {
    video = await resolve(track.url, track.ordinal);
  } catch (error) {
    throw Error("player_" + error.message);
  }
  return { ...video, audioId: audio };
}

// supabase/functions/anime-source/index.ts
var origins = /* @__PURE__ */ new Set(["https://yomiku.site", "https://www.yomiku.site", "https://yooickuu.github.io", "http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:5500", "http://localhost:5500"]);
var healthCache = null;
var limits = /* @__PURE__ */ new Map();
Deno.serve(async (req) => {
  const requestURL = new URL(req.url);
  const secret = Deno.env.get("VIDEO_PROXY_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const endpoint = (Deno.env.get("SUPABASE_URL") || requestURL.origin) + "/functions/v1/anime-source";
  const proxy = () => createMediaProxy({ secret, endpoint });
  if (requestURL.searchParams.get("stream") === "1") {
    try {
      return await proxy().handle(req);
    } catch {
      return new Response("Proxy is not configured", { status: 503, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  }
  const origin = req.headers.get("Origin") || "";
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", ...origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {} };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: "origin_not_allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  if (req.method === "GET" && new URL(req.url).searchParams.get("source") === "kodik") {
    try {
      const video = await publishedKodikVideo("mal-28285", 1, "kodik-4243");
      return reply({ ready: true, version: 17, qualities: video.sources.map((s) => s.quality) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      return reply({ ready: false, version: 17, detail: message.replace(/https?:\/\/[^\s)]+/g, "[upstream]").replace(/[a-zA-Z0-9]{24,}/g, "[redacted]").slice(0, 220) }, 502);
    }
  }
  if (req.method === "GET") {
    if (!healthCache || Date.now() - healthCache.at > 6e4) {
      try {
        await snapshotHealth();
        healthCache = { at: Date.now(), ready: true, status: "ok" };
      } catch (e) {
        const m = e instanceof Error ? e.message : "unknown";
        healthCache = { at: Date.now(), ready: false, status: /^[a-z_0-9]+$/.test(m) ? m : "source_unavailable", detail: m.replace(/https?:\/\/[^\s)]+/g, "[upstream]").slice(0, 180) };
      }
    }
    return reply({ ready: healthCache.ready, version: 17, kodikPlayback: true, guestPlayback: true, sourceStatus: healthCache.status, ...healthCache.detail ? { detail: healthCache.detail } : {} });
  }
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  try {
    const key = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const now = Date.now();
    let limit = limits.get(key);
    if (!limit || now - limit.at > 6e4) limit = { at: now, count: 0 };
    limit.count++;
    limits.set(key, limit);
    if (limits.size > 1e3) {
      for (const [id2, l] of limits) if (now - l.at > 6e4) limits.delete(id2);
    }
    if (limit.count > 60) return reply({ error: "too_many_requests" }, 429);
    const raw = await req.text();
    if (raw.length > 512) return reply({ error: "invalid_request" }, 400);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ error: "invalid_request" }, 400);
    }
    if (!body || typeof body !== "object") return reply({ error: "invalid_request" }, 400);
    if (body.action === "kodik-video") return reply(await proxy().video(await publishedKodikVideo(body.id, body.episode, body.audio, { season: body.season, ordinal: body.ordinal })));
    const id = Number(body.id), ordinal = Number(body.ordinal);
    if (!positiveID(id)) return reply({ error: "invalid_id" }, 400);
    if (body.action === "release") return reply(await snapshotRelease(id));
    if (!Number.isFinite(ordinal) || ordinal < 0 || ordinal > 1e4) return reply({ error: "invalid_episode" }, 400);
    if (body.action === "voices") return reply({ voices: (await snapshotVoices(id, ordinal)).map(({ url, ...v }) => v) });
    if (body.action === "video" && /^go-\d+$/.test(body.audio || "")) return reply(await proxy().video(await snapshotVideo(id, ordinal, body.audio)));
    return reply({ error: "invalid_request" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.warn("anime-source failure", /^[a-z_0-9]+$/.test(message) ? message : error instanceof Error ? error.name : "unknown");
    return reply({ error: ["episode_missing", "audio_missing", "incomplete_playlist", "changed_playlist"].includes(message) ? message : "source_unavailable", sourceStatus: /^[a-z_0-9]+$/.test(message) ? message : "network_or_response_error" }, 502);
  }
});
