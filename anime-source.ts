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
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await readUpstream(url, options);
    } catch (error) {
      if (attempt || !/unexpected EOF|connection (?:reset|closed)|http2/i.test(error.message)) throw error;
    }
  }
}
async function readUpstream(url, options = {}) {
  const allowed = /* @__PURE__ */ new Set([new URL(url).hostname, "kodikplayer.com", "kodik.info", "kodik.biz", "kodik.cc", "yomiku.site", "www.yomiku.site"]);
  let current = new URL(url), method = options.method || "GET", body = options.body;
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetch(current, { ...options, ...transportOptions(), method, body, headers: { "Accept-Encoding": "identity", "User-Agent": "yomiku/1.0 (+https://yomiku.site/)", ...options.headers }, redirect: "manual", signal: AbortSignal.timeout(15e3) });
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
      if (attempt === 2) throw Error("upstream_invalid_json");
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
async function resolveKodikPlayer(url, ordinal) {
  const html = await textFetch(url);
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
  const body = {};
  for (const key of ["d", "d_sign", "pd", "pd_sign", "ref", "ref_sign"]) body[key] = params[key] || "";
  for (const key of ["type", "id", "hash"]) {
    body[key] = html.match(new RegExp("vInfo\\." + key + "\\s*=\\s*'([^']+)'"))?.[1];
    if (!body[key]) throw Error("player_changed");
  }
  const data = await jsonFetch("https://kodikplayer.com" + endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": url, "Origin": "https://kodikplayer.com" }, body: new URLSearchParams(body).toString() });
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

// server/published-kodik.js
var manifestCache = /* @__PURE__ */ new Map();
async function fetchManifest(url) {
  const data = await jsonFetch(url);
  return { ok: true, json: async () => data };
}
async function publishedKodikVideo(id, index, audio, { fetcher = fetchManifest, resolve = kodikVideo } = {}) {
  if (!/^(mal|shikimori|lib)-\d+$/.test(id) || !Number.isSafeInteger(index) || index < 1 || !/^kodik-\d+$/.test(audio)) throw Error("invalid_request");
  let cached2 = manifestCache.get(id);
  if (!cached2 || Date.now() > cached2.until) {
    const response = await fetcher(`https://yomiku.site/data/kodik/${id}.json`, { signal: AbortSignal.timeout(1e4) });
    if (!response.ok) throw Error("episode_missing");
    const data = await response.json();
    if (data.id !== id || !Array.isArray(data.episodes)) throw Error("invalid_manifest");
    cached2 = { data, until: Date.now() + 6e4 };
    manifestCache.set(id, cached2);
    if (manifestCache.size > 100) manifestCache.delete(manifestCache.keys().next().value);
  }
  const track = cached2.data.episodes[index - 1]?.tracks?.find((t) => t.audioId === audio);
  if (!track || !validEmbed(track.url) || audio !== `kodik-${track.translationId}`) throw Error("audio_missing");
  const video = await resolve(track.url, track.ordinal);
  return { ...video, audioId: audio };
}

// supabase/functions/anime-source/index.ts
var origins = /* @__PURE__ */ new Set(["https://yomiku.site", "https://www.yomiku.site", "https://yooickuu.github.io", "http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:5500", "http://localhost:5500"]);
var healthCache = null;
var limits = /* @__PURE__ */ new Map();
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", ...origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {} };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: "origin_not_allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  if (req.method === "GET" && new URL(req.url).searchParams.get("source") === "kodik") {
    try {
      const video = await publishedKodikVideo("mal-28285", 1, "kodik-4243");
      return reply({ ready: true, version: 12, qualities: video.sources.map((s) => s.quality) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      return reply({ ready: false, version: 12, detail: message.replace(/https?:\/\/[^\s)]+/g, "[upstream]").replace(/[a-zA-Z0-9]{24,}/g, "[redacted]").slice(0, 220) }, 502);
    }
  }
  if (req.method === "GET") {
    if (!healthCache || Date.now() - healthCache.at > 6e4) {
      try {
        await snapshotHealth();
        healthCache = { at: Date.now(), ready: true, status: "ok" };
      } catch (e) {
        const m = e instanceof Error ? e.message : "unknown";
        healthCache = { at: Date.now(), ready: false, status: /^[a-z_]+(?:_\d+)?$/.test(m) ? m : "source_unavailable", detail: m.replace(/https?:\/\/[^\s)]+/g, "[upstream]").slice(0, 180) };
      }
    }
    return reply({ ready: healthCache.ready, version: 12, kodikPlayback: true, guestPlayback: true, sourceStatus: healthCache.status, ...healthCache.detail ? { detail: healthCache.detail } : {} });
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
    if (body.action === "kodik-video") return reply(await publishedKodikVideo(body.id, body.episode, body.audio));
    const id = Number(body.id), ordinal = Number(body.ordinal);
    if (!positiveID(id)) return reply({ error: "invalid_id" }, 400);
    if (body.action === "release") return reply(await snapshotRelease(id));
    if (!Number.isFinite(ordinal) || ordinal < 0 || ordinal > 1e4) return reply({ error: "invalid_episode" }, 400);
    if (body.action === "voices") return reply({ voices: (await snapshotVoices(id, ordinal)).map(({ url, ...v }) => v) });
    if (body.action === "video" && /^go-\d+$/.test(body.audio || "")) return reply(await snapshotVideo(id, ordinal, body.audio));
    return reply({ error: "invalid_request" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.warn("anime-source failure", /^[a-z_]+(?:_\d+)?$/.test(message) ? message : error instanceof Error ? error.name : "unknown");
    return reply({ error: ["episode_missing", "audio_missing", "incomplete_playlist", "changed_playlist"].includes(message) ? message : "source_unavailable", sourceStatus: /^[a-z_]+(?:_\d+)?$/.test(message) ? message : "network_or_response_error" }, 502);
  }
});
