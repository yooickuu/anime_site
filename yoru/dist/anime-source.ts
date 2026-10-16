// server/animego.js
var GO_ORIGIN = "https://animego.me";
function decodeHTML(s = "") {
  return s.replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, (_, n, k) => {
    if (n) {
      const c = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return c <= 1114111 ? String.fromCodePoint(c) : "";
    }
    return { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " }[k.toLowerCase()];
  });
}
function plain(s = "") {
  return decodeHTML(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], decodeHTML(m[2])]));
}
function tags(html) {
  return html.match(/<(?:[^>"']|"[^"]*"|'[^']*')+>/g) || [];
}
function positiveID(n) {
  return Number.isSafeInteger(Number(n)) && Number(n) > 0 && Number(n) < 1e8;
}
function parseEpisodes(html) {
  const map = /* @__PURE__ */ new Map();
  for (const tag of tags(html).filter((t) => t.includes('data-episode-number="'))) {
    const a = attrs(tag), ordinal = Number(a["data-episode-number"]), id = Number(a["data-episode"]);
    if (Number.isFinite(ordinal) && ordinal >= 0 && positiveID(id)) {
      if (map.has(ordinal) && map.get(ordinal).id !== id) throw Error("ambiguous_episode");
      map.set(ordinal, { ordinal, id });
    }
  }
  return [...map.values()].sort((a, b) => a.ordinal - b.ordinal);
}
function parseVoices(html) {
  const map = /* @__PURE__ */ new Map();
  for (const tag of tags(html).filter((t) => t.includes('data-player="'))) {
    const a = attrs(tag);
    if (a["data-provider-slug"] !== "kodik" || !positiveID(a["data-ptranslation"])) continue;
    let u;
    try {
      u = new URL(a["data-player"], GO_ORIGIN);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || u.hostname !== "kodikplayer.com" || u.port || u.username || u.password || !/^\/(?:seria|serial|video)\/\d+\/[a-z0-9]+\//.test(u.pathname)) continue;
    const label = plain(a["data-translation-title"]).slice(0, 100), id = "go-" + a["data-ptranslation"];
    map.set(id, { id, label, language: /субтитр/i.test(label) ? "ja" : "ru", subtitles: /субтитр/i.test(label), url: u.href });
  }
  return [...map.values()];
}
function parsePlayer(html) {
  const tag = tags(html).find((t) => t.includes('data-anime-player-episodes-total-value="')) || "";
  const a = attrs(tag), episodes = parseEpisodes(html), voices = parseVoices(html);
  const total = Number(a["data-anime-player-episodes-total-value"]);
  const ranges = JSON.parse(a["data-anime-player-episodes-pages-value"] || "[]");
  if (!Number.isSafeInteger(total) || total < 0 || total > 1e4 || !Array.isArray(ranges) || ranges.length > 100) throw Error("invalid_episode_count");
  return { total, ranges, episodes, voices };
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
async function textFetch(url, options = {}) {
  const r = await fetch(url, { ...options, headers: { "User-Agent": "yooickuu/1.0 (+https://yooickuu.github.io/anime_site/)", ...options.headers }, redirect: "error", signal: AbortSignal.timeout(15e3) });
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
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let i = 0;
  for (const p of parts) {
    bytes.set(p, i);
    i += p.length;
  }
  return new TextDecoder().decode(bytes);
}
async function goJSON(path) {
  if (!/^\/player\/(?:\d+(?:\/episodes\?page=\d+)?|videos\/\d+)$/.test(path)) throw Error("invalid_path");
  const raw = await textFetch(GO_ORIGIN + path, { headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" } });
  const d = JSON.parse(raw);
  if (d.status !== "success" || typeof d.data?.content !== "string") throw Error("invalid_player");
  return d.data;
}
async function goRelease(id) {
  if (!positiveID(id)) throw Error("invalid_id");
  return cached("release:" + id, 3e5, async () => {
    const d = await goJSON("/player/" + id), p = parsePlayer(d.content);
    const map = new Map(p.episodes.map((e) => [e.ordinal, e]));
    const pages = p.ranges.filter((r) => r.page > 0);
    for (let start = 0; start < pages.length; start += 3) {
      const batch = await Promise.all(pages.slice(start, start + 3).map(async (r) => {
        if (!Number.isSafeInteger(r.page) || r.page < 1 || r.page > 100) throw Error("invalid_page");
        const d2 = await goJSON("/player/" + id + "/episodes?page=" + r.page);
        if (Number(d2.page) !== r.page || Number(d2.total) !== p.total) throw Error("changed_playlist");
        return parseEpisodes(d2.content);
      }));
      for (const list of batch) for (const e of list) {
        if (map.has(e.ordinal) && map.get(e.ordinal).id !== e.id) throw Error("ambiguous_episode");
        map.set(e.ordinal, e);
      }
    }
    if (map.size !== p.total) throw Error("incomplete_playlist");
    return { episodes: [...map.values()].sort((a, b) => a.ordinal - b.ordinal), voices: p.voices.map(({ url, ...v }) => v) };
  });
}
async function goVoices(animeId, ordinal) {
  const release = await goRelease(animeId);
  const episode = release.episodes.find((e) => e.ordinal === Number(ordinal));
  if (!episode) throw Error("episode_missing");
  return cached("voices:" + episode.id, 12e4, async () => parseVoices((await goJSON("/player/videos/" + episode.id)).content));
}
async function goVideo(animeId, ordinal, audio) {
  const voices = await goVoices(animeId, ordinal), voice = voices.find((v) => v.id === audio);
  if (!voice) throw Error("audio_missing");
  return cached("stream:" + animeId + ":" + ordinal + ":" + audio, 45e3, async () => {
    const html = await textFetch(voice.url);
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
    const data = JSON.parse(await textFetch("https://kodikplayer.com" + endpoint, { method: "POST", body: new URLSearchParams(body) }));
    const sources = parseStreams(data.links);
    if (!sources.length) throw Error("no_streams");
    return { sources, url: (sources.find((s) => s.quality === 720) || sources[0]).url, stream: true, ordinal: Number(ordinal), opening: null, ending: null };
  });
}

// supabase/functions/anime-source/index.ts
var origins = /* @__PURE__ */ new Set(["https://yooickuu.github.io", "http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:5500", "http://localhost:5500"]);
var healthCache = null;
var limits = /* @__PURE__ */ new Map();
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", ...origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {} };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: "origin_not_allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  if (req.method === "GET") {
    if (!healthCache || Date.now() - healthCache.at > 6e4) {
      try {
        await goJSON("/player/65");
        healthCache = { at: Date.now(), ready: true, status: "ok" };
      } catch (e) {
        const m = e instanceof Error ? e.message : "unknown";
        healthCache = { at: Date.now(), ready: false, status: /^[a-z_]+(?:_\d+)?$/.test(m) ? m : "source_unavailable" };
      }
    }
    return reply({ ready: healthCache.ready, version: 2, sourceStatus: healthCache.status });
  }
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply({ error: "unauthorized" }, 401);
  try {
    const auth = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", { headers: { Authorization: authorization, apikey: Deno.env.get("SUPABASE_ANON_KEY") || "" }, signal: AbortSignal.timeout(1e4) });
    if (!auth.ok) {
      await auth.body?.cancel();
      return reply({ error: "unauthorized" }, 401);
    }
    const user = await auth.json();
    if (!user.id) return reply({ error: "unauthorized" }, 401);
    const now = Date.now();
    let limit = limits.get(user.id);
    if (!limit || now - limit.at > 6e4) limit = { at: now, count: 0 };
    limit.count++;
    limits.set(user.id, limit);
    if (limits.size > 1e3) {
      for (const [id2, l] of limits) if (now - l.at > 6e4) limits.delete(id2);
    }
    if (limit.count > 60) return reply({ error: "too_many_requests" }, 429);
    const raw = await req.text();
    if (raw.length > 512) return reply({ error: "invalid_request" }, 400);
    const body = JSON.parse(raw), id = Number(body.id), ordinal = Number(body.ordinal);
    if (!positiveID(id)) return reply({ error: "invalid_id" }, 400);
    if (body.action === "release") return reply(await goRelease(id));
    if (!Number.isFinite(ordinal) || ordinal < 0 || ordinal > 1e4) return reply({ error: "invalid_episode" }, 400);
    if (body.action === "voices") return reply({ voices: (await goVoices(id, ordinal)).map(({ url, ...v }) => v) });
    if (body.action === "video" && /^go-\d+$/.test(body.audio || "")) return reply(await goVideo(id, ordinal, body.audio));
    return reply({ error: "invalid_request" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.warn("anime-source failure", /^[a-z_]+(?:_\d+)?$/.test(message) ? message : error instanceof Error ? error.name : "unknown");
    return reply({ error: ["episode_missing", "audio_missing", "incomplete_playlist", "changed_playlist"].includes(message) ? message : "source_unavailable" }, 502);
  }
});
