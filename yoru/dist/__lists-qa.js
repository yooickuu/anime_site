// src/library-view.js
function savedIds(state2, list = "all") {
  const collection = state2.collections?.find((c) => c.id === list);
  if (collection) return [...new Set(collection.items)];
  return Object.keys(state2.entries || {}).filter((id) => {
    const e = state2.entries[id];
    return list === "all" || (list === "favorites" ? e.favorite : e.status === list || e.legacyLists?.includes(list));
  });
}
function savedCards(state2, list, lookup) {
  return savedIds(state2, list).map((id) => ({ ...{ title: id, genres: [], year: "", episodes: 0, catalogOnly: true }, ...state2.entries[id]?.anime || {}, ...lookup(id) || {}, id }));
}
async function loadSavedCards(ids, resolve, { current = () => true, onCard = () => {
} } = {}) {
  let cursor = 0;
  const failed = [];
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (current() && cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const card = await resolve({ id });
        if (current() && card) onCard(card);
      } catch {
        failed.push(id);
      }
    }
  }));
  return failed;
}

// src/catalog-query.js
var normalizeSearch = (value) => String(value ?? "").normalize("NFKC").toLocaleLowerCase().replace(/ё/g, "\u0435").replace(/[ьъ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
var genreGroups = {
  "\u042D\u043A\u0448\u0435\u043D": ["action", "\u0431\u043E\u0435\u0432\u0438\u043A", "\u044D\u043A\u0448\u0435\u043D"],
  "\u041F\u0440\u0438\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F": ["adventure", "\u043F\u0440\u0438\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F"],
  "\u0424\u044D\u043D\u0442\u0435\u0437\u0438": ["fantasy", "\u0444\u044D\u043D\u0442\u0435\u0437\u0438"],
  "\u0420\u043E\u043C\u0430\u043D\u0442\u0438\u043A\u0430": ["romance", "\u0440\u043E\u043C\u0430\u043D\u0442\u0438\u043A\u0430"],
  "\u041A\u043E\u043C\u0435\u0434\u0438\u044F": ["comedy", "\u043A\u043E\u043C\u0435\u0434\u0438\u044F"],
  "\u041F\u043E\u0432\u0441\u0435\u0434\u043D\u0435\u0432\u043D\u043E\u0441\u0442\u044C": ["slice of life", "\u043F\u043E\u0432\u0441\u0435\u0434\u043D\u0435\u0432\u043D\u043E\u0441\u0442\u044C"],
  "\u0421\u043F\u043E\u0440\u0442": ["sport", "sports", "\u0441\u043F\u043E\u0440\u0442"],
  "\u0424\u0430\u043D\u0442\u0430\u0441\u0442\u0438\u043A\u0430": ["sci fi", "science fiction", "\u0444\u0430\u043D\u0442\u0430\u0441\u0442\u0438\u043A\u0430"],
  "\u0414\u0440\u0430\u043C\u0430": ["drama", "\u0434\u0440\u0430\u043C\u0430"],
  "\u0422\u0440\u0438\u043B\u043B\u0435\u0440": ["thriller", "\u0442\u0440\u0438\u043B\u043B\u0435\u0440"],
  "\u0421\u0432\u0435\u0440\u0445\u044A\u0435\u0441\u0442\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435": ["supernatural", "\u0441\u0432\u0435\u0440\u0445\u044A\u0435\u0441\u0442\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435"],
  "\u0414\u0435\u0442\u0435\u043A\u0442\u0438\u0432": ["mystery", "\u0434\u0435\u0442\u0435\u043A\u0442\u0438\u0432"],
  "\u0423\u0436\u0430\u0441\u044B": ["horror", "\u0443\u0436\u0430\u0441\u044B"],
  "\u041C\u0443\u0437\u044B\u043A\u0430": ["music", "\u043C\u0443\u0437\u044B\u043A\u0430"],
  "\u0428\u043A\u043E\u043B\u0430": ["school", "\u0448\u043A\u043E\u043B\u0430"],
  "\u0421\u0451\u043D\u0435\u043D": ["shounen", "shonen", "\u0441\u0451\u043D\u0435\u043D", "\u0441\u0435\u043D\u0435\u043D"]
};
var genreMap = new Map(Object.entries(genreGroups).flatMap(([name, variants]) => [name, ...variants].map((v) => [normalizeSearch(v), name])));
var normalizeGenre = (value) => genreMap.get(normalizeSearch(value)) || normalizeSearch(value);
function normalizeType(value) {
  const v = normalizeSearch(typeof value === "object" ? value?.value || value?.name : value).replaceAll(" ", "");
  if (/^(tv\d*|тв|твсериал|series|animeserial|сериал)$/.test(v)) return "TV";
  return { movie: "MOVIE", film: "MOVIE", \u0444\u0438\u043B\u043C: "MOVIE", \u043F\u043E\u043B\u043D\u043E\u043C\u0435\u0442\u0440\u0430\u0436\u043D\u044B\u0439\u0444\u0438\u043B\u043C: "MOVIE", anime: "MOVIE", ova: "OVA", oad: "OVA", ona: "ONA", web: "ONA", webseries: "ONA", special: "SPECIAL", tv_special: "SPECIAL", tvspecial: "SPECIAL", \u0441\u043F\u0435\u0446\u0432\u044B\u043F\u0443\u0441\u043A: "SPECIAL", music: "MUSIC" }[v] || v.toUpperCase();
}
function matchesType(item, filter = "all") {
  if (!filter || filter === "all") return true;
  const type = normalizeType(item.type);
  return filter === "series" ? ["TV", "ONA"].includes(type) : filter.split(",").some((t) => normalizeType(t) === type);
}
function near(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), before;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
    }
    if (Math.min(...row) > limit) return false;
    before = prev;
    prev = row;
  }
  return prev[b.length] <= limit;
}
var namesCache = /* @__PURE__ */ new WeakMap();
function names(item) {
  if (!namesCache.has(item)) namesCache.set(item, normalizeSearch([item.title, item.originalTitle, item.alt, ...Object.values(item.translations || {}).map((v) => v?.[0])].filter(Boolean).join(" ")));
  return namesCache.get(item);
}
function searchScore(item, query) {
  const q = normalizeSearch(query);
  if (!q) return 1;
  const text = names(item), compact = text.replaceAll(" ", ""), needle = q.replaceAll(" ", "");
  if (normalizeSearch(item.title).startsWith(q)) return 100;
  if (text.includes(q)) return 80;
  if (compact.includes(needle)) return 65;
  const words = text.split(" "), tokens = q.split(" ");
  if (tokens.every((t) => words.some((w) => w.startsWith(t) || t.length >= 4 && near(t, w, t.length >= 8 ? 2 : 1)))) return 40;
  return 0;
}
var rating = (a) => Number(a.audienceRating || a.rating || a.score) || 0;
var popularity = (a) => Number(a.popularity || a.views || a.members) || 0;
var updated = (a) => {
  const value = a.catalogUpdatedAt || a.updatedAt || a.updated_at || a.lastEpisodeAt;
  return typeof value === "number" ? value : Date.parse(value) || 0;
};
function catalogueStatus(item, now = Date.now()) {
  const status = String(item.status || item.releaseStatus || "").toLowerCase();
  if (["announced", "not_yet_aired", "anons", "planned"].includes(status)) return "announced";
  if (["airing", "ongoing", "releasing"].includes(status) || item.ongoing) return "airing";
  if (["finished", "released", "completed"].includes(status)) return "finished";
  if (Date.parse(item.airedAt) > now) return "announced";
  return "finished";
}
function queryCatalogue(items, options = {}) {
  const rows = items.map((item, index) => ({ item, index, score: searchScore(item, options.query) })).filter(({ item, score }) => score > 0 && (!options.year || options.year === "all" || Number(item.year) === Number(options.year)) && (!options.minRating || rating(item) >= Number(options.minRating)) && (options.maxRating === void 0 || rating(item) <= Number(options.maxRating)) && (!options.status || options.status === "all" || catalogueStatus(item) === options.status) && matchesType(item, options.type) && (!options.ongoing || item.ongoing) && (!options.genre || options.genre === "all" || item.genres?.some((g) => normalizeGenre(g) === normalizeGenre(options.genre))));
  const compare = (a, b) => {
    const x = a.item, y = b.item;
    if (options.sort === "newest") return (y.year || 0) - (x.year || 0);
    if (options.sort === "oldest") return (x.year || 0) - (y.year || 0);
    if (options.sort === "alphabetical") return x.title.localeCompare(y.title);
    if (options.sort === "latest") return updated(y) - updated(x);
    if (options.sort === "topRated") return rating(y) - rating(x) || popularity(y) - popularity(x);
    if (options.sort === "hiddenGems") return Number(popularity(y) > 0) - Number(popularity(x) > 0) || popularity(x) - popularity(y);
    return popularity(y) - popularity(x);
  };
  rows.sort((a, b) => (options.query ? b.score - a.score : 0) || compare(a, b) || b.index - a.index);
  return rows.map((r) => r.item);
}

// src/profile-redesign.js
var h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var profileText = (key, lang) => ({ settings: ["\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438", "Settings", "\u8A2D\u5B9A"], badges: ["\u0414\u043E\u0441\u0442\u0438\u0436\u0435\u043D\u0438\u044F", "Achievements", "\u5B9F\u7E3E"], friends: ["\u0414\u0440\u0443\u0437\u044C\u044F", "Friends", "\u53CB\u9054"], history: ["\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430", "Watch history", "\u8996\u8074\u5C65\u6B74"], lists: ["\u0421\u043F\u0438\u0441\u043A\u0438", "Lists", "\u30EA\u30B9\u30C8"], profile: ["\u041F\u0440\u043E\u0444\u0438\u043B\u044C", "Profile", "\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB"], more: ["\u0415\u0449\u0451", "More", "\u3082\u3063\u3068\u898B\u308B"] })[key]?.[{ ru: 0, en: 1, ja: 2 }[lang] ?? 0] || key;
function mountOwnLists(root, ctx) {
  const life = new AbortController();
  let alive = true, selected = ctx.view.list || "all", query = ctx.view.query || "", sort = ctx.view.sort || "picked", type = ctx.view.type || "all", limit = 60;
  const live = () => alive && root.isConnected && ctx.live();
  const tabs = [{ id: "all", name: ctx.t("allStories") }, ...ctx.state.statuses.map((s) => ({ id: s.id, name: ctx.statusName(s) })), ...ctx.state.collections.map((s) => ({ id: s.id, name: s.name }))];
  if (!tabs.some((s) => s.id === selected)) selected = "all";
  const listButtons = tabs.map((s) => `<button type="button" data-profile-list="${h(s.id)}"><span>${h(s.name)}</span><small>${savedIds(ctx.state, s.id).length}</small></button>`).join("");
  const listActions = `<button class="text-button" data-action="manage-statuses">${ctx.t("manageStatuses")}</button><button class="text-button" data-action="create-status">${ctx.t("createStatus")}</button>`;
  root.innerHTML = `<dialog class="profile-lists-dialog shell-dialog" aria-label="${h(profileText("lists", ctx.lang))}"><header><h2>${profileText("lists", ctx.lang)}</h2><button type="button" class="icon-button" data-list-menu-close aria-label="${ctx.t("close")}">\xD7</button></header><div class="profile-list-menu-items">${listButtons}${listActions}</div></dialog><div class="profile-list-layout"><aside class="profile-list-nav liquid-glass">${listButtons}<button type="button" class="profile-list-edit" data-list-menu-open aria-label="${ctx.t("manageStatuses")}" aria-haspopup="dialog"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg></button>${listActions}</aside><section class="profile-list-results"><div class="profile-list-filters"><input data-profile-query type="search" aria-label="${ctx.t("searchThisList")}" placeholder="${ctx.t("searchThisList")}" value="${h(query)}"><select data-profile-sort aria-label="${ctx.t("order")}">${["picked", "newest", "alphabetical", "topRated"].map((s) => `<option value="${s}" ${sort === s ? "selected" : ""}>${ctx.t(s)}</option>`).join("")}</select><select data-profile-type aria-label="${ctx.t("allTypes")}">${[["all", ctx.t("allTypes")], ["TV", "TV"], ["MOVIE", ctx.t("movies")], ["OVA", "OVA"], ["ONA", "ONA"]].map(([id, label]) => `<option value="${id}" ${type === id ? "selected" : ""}>${label}</option>`).join("")}</select></div><p data-profile-count role="status"></p><div class="anime-grid" data-profile-cards></div><button class="button soft" data-profile-more hidden>${profileText("more", ctx.lang)}</button></section></div>`;
  function paint() {
    if (!live()) return;
    Object.assign(ctx.view, { list: selected, query, sort, type });
    const all = savedCards(ctx.state, selected, ctx.lookup), items = queryCatalogue(all, { query, type, sort });
    root.querySelector("[data-profile-count]").textContent = `${items.length} / ${all.length}`;
    root.querySelectorAll("[data-profile-list]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.profileList === selected)));
    root.querySelector("[data-profile-cards]").innerHTML = items.slice(0, limit).map((a, i) => `<article class="anime-card"><button class="poster-button" data-details="${h(a.id)}" aria-label="${h(ctx.title(a))}">${ctx.cover(a) ? `<img src="${h(ctx.cover(a))}" data-poster="${h(a.id)}" alt="" loading="${i < 4 ? "eager" : "lazy"}" decoding="async" fetchpriority="${i < 4 ? "high" : "auto"}">` : ""}</button><button class="anime-title" data-details="${h(a.id)}">${h(ctx.title(a))}</button></article>`).join("") || `<p class="notice">${ctx.t("empty")}</p>`;
    root.querySelector("[data-profile-more]").hidden = limit >= items.length;
    ctx.reveal?.(root);
  }
  const listDialog = root.querySelector(".profile-lists-dialog");
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-list-menu-open]")) {
      listDialog.showModal();
      return;
    }
    if (e.target === listDialog || e.target.closest("[data-list-menu-close]")) {
      listDialog.close();
      return;
    }
    const b = e.target.closest("[data-profile-list]");
    if (b) {
      selected = b.dataset.profileList;
      limit = 60;
      if (listDialog.open) listDialog.close();
      paint();
    } else if (e.target.closest("[data-profile-more]")) {
      limit += 60;
      paint();
    } else if (e.target.closest(".profile-lists-dialog [data-action]")) listDialog.close();
  }, { signal: life.signal });
  root.addEventListener("input", (e) => {
    if (e.target.hasAttribute("data-profile-query")) {
      query = e.target.value;
      limit = 60;
      paint();
    }
  }, { signal: life.signal });
  root.addEventListener("change", (e) => {
    if (e.target.hasAttribute("data-profile-sort")) sort = e.target.value;
    else if (e.target.hasAttribute("data-profile-type")) type = e.target.value;
    else return;
    limit = 60;
    paint();
  }, { signal: life.signal });
  paint();
  ctx.enhance?.();
  void loadSavedCards([.../* @__PURE__ */ new Set([...savedIds(ctx.state), ...ctx.state.collections.flatMap((c) => c.items)])], ctx.resolve, { current: live, onCard: ctx.remember }).then(() => paint());
  return () => {
    alive = false;
    life.abort();
    if (listDialog.open) listDialog.close();
  };
}

// <stdin>
var state = { entries: {}, statuses: [{ id: "favorites", name: "\u041B\u044E\u0431\u0438\u043C\u044B\u0435" }, { id: "watching", name: "\u0421\u043C\u043E\u0442\u0440\u044E" }, { id: "planned", name: "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E" }, { id: "completed", name: "\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u043D\u043E" }, { id: "ongoing", name: "\u041E\u043D\u0433\u043E\u0438\u043D\u0433" }], collections: [] };
mountOwnLists(document.querySelector("#profile-saved"), { state, view: {}, t: (k) => ({ allStories: "\u0412\u0441\u0435", manageStatuses: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u043F\u0438\u0441\u043A\u0430\u043C\u0438", createStatus: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A", close: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", searchThisList: "\u041F\u043E\u0438\u0441\u043A \u0432 \u0441\u043F\u0438\u0441\u043A\u0435", empty: "\u0421\u043F\u0438\u0441\u043E\u043A \u043F\u0443\u0441\u0442" })[k] || k, lang: "ru", statusName: (s) => s.name, lookup: () => null, resolve: async () => null, remember: () => {
}, live: () => true });
