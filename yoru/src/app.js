import {initSelectMenus, enhanceSelects, closeSelectMenu} from './select-menu.js';
import {createPlayback} from './playback.js';
import {cropAvatar} from './avatar-crop.js';
import {authErrorKey} from "./public-config.js";
import {combinedCatalogue, resolveRelease, videoEpisode} from "./sources.js";
import {icon} from "./icons.js";
import {controlsHTML, attachControls} from "./player-controls.js";
import { fetchCatalogue, fetchRelease, providerEpisode, chooseQuality, releaseSeasons } from "./provider.js";
import {
  anime,
  demo,
  byId,
  titleFor,
  descriptionFor,
  cover,
  remoteAnime,
  registerAnime,
} from "./catalog.js";
import { dictionaries, genreLabels, langIndex } from "./i18n.js";
import {
  defaults,
  normalize,
  applyOperation,
  skipTarget,
  nextEpisodeAction,
  timeLabel,
  episodeNavigation,
  profileStats,
} from "./state.js";
import {
  client,
  configured,
  loadData,
  saveOperation,
  hasRemoteSource,
  mediaSource,
} from "./backend.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let onlineItems = [],
  catalogPage = 1,
  catalogTotal = 0,
  catalogPartial = false, catalogScope = "all",
  catalogPages = 1,
  catalogBusy = false,
  catalogError = false,
  catalogGeneration = 0,
  searchTimer,
  typeFilter = "all",
  ongoingOnly = false,
  playback = null,
  playerSeasons = [],
  providerTiming = null,
  endingSkipped = false;
const bookmark = icon("bookmark");
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
let lang = read("yooickuu.language", "ru");
if (!dictionaries[lang]) lang = "ru";
let theme = read("yooickuu.theme", "light"),
  state = defaults(),
  user = null,
  ready = false,
  dataError = false,
  avatarUrl = "",
  page = "home",
  list = "all",
  query = "",
  genre = "all",
  sort = "picked",
  detailId = null,
  authMode = "login",
  authMethod = "email",
  phoneNumber = "",
  authBusy = false,
  toastTimer,
  syncBusy = false,
  syncFailure = false,
  authGeneration = 0;
let operations = [],
  current = null,
  episode = 1,
  sourceKey = null,
  sourceGeneration = 0,
  skipDone = false,
  lastProgress = 0,
  playerOpening = false,
  mediaFiles = new Map();
const t = (key) => dictionaries[lang][key] || key;
const title = (a) => (a?.id === "sintel" ? t("demo") : titleFor(a, lang));
const statusName = (s) => s.name || t(s.key || s.id);
const brand = () =>
  '<a href="#home" class="brand"><img class="brand-mark brand-icon" src="assets/yooickuu-icon.png" alt=""><span>yooickuu<span class="brand-dot">.</span></span></a>';
const closeButton = (id) =>
  `<button class="dialog-close icon-button" data-close="${id}" aria-label="${t("close")}">${icon("close")}</button>`;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3500);
}
function applyAppearance() {
  document.documentElement.lang = lang;
  document.body.classList.toggle("dark", theme === "dark");
  document.title = "yooickuu — " + t("tagline");
  try {
    localStorage.setItem("yooickuu.language", JSON.stringify(lang));
    localStorage.setItem("yooickuu.theme", JSON.stringify(theme));
  } catch {}
}
function navigate(next, selected = "all") {
  page = next;
  list = selected;
  query = "";
  genre = "all";
  location.hash =
    next === "library" && selected !== "all"
      ? `library/${encodeURIComponent(selected)}`
      : next;
  render();
  if (next !== "library" && next !== "profile") loadCatalogue();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function fromHash() {
  const hash = location.hash.slice(1).split("/");
  if (["home", "catalog", "library", "profile"].includes(hash[0])) {
    page = hash[0];
    try {
      list = decodeURIComponent(hash[1] || "all");
    } catch {
      list = "all";
    }
  }
  render();
}
function savedCount() {
  return Object.keys(state.entries).length;
}
function render() {
  applyAppearance();
  $("#app").innerHTML =
    `<header class="header">${brand()}<nav aria-label="${t("catalog")}">${["home", "catalog", "library"].map((v) => `<button class="nav-link ${page === v ? "active" : ""}" data-nav="${v}">${t(v)}${v === "library" && user ? ` <span id="list-count">${savedCount()}</span>` : ""}</button>`).join("")}</nav><div class="header-tools"><label class="search"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input id="search" type="search" placeholder="${t("search")}" aria-label="${t("search")}" value="${esc(query)}"><kbd>⌘ K</kbd></label><select id="language" aria-label="${t("language")}">${[
      ["ru", "RU"],
      ["en", "EN"],
      ["ja", "日本語"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${lang === v ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select><button class="icon-button" data-action="theme" aria-label="${t("theme")}">${icon(theme === "dark" ? "sun" : "moon")}</button>${user ? `<button class="avatar" data-nav="profile" aria-label="${t("profile")}">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="">` : esc((state.preferences.name || user.email || "u").slice(0, 1).toUpperCase())}</button>` : `<button class="button primary login-button" data-action="login">${t("login")}</button>`}</div></header><main>${page === "home" ? homeHTML() : ""}${page === "profile" ? profileHTML() : page === "library" && !user ? guestHTML() : catalogShell()}</main><footer>${brand()}<button data-action="about">${t("about")}</button></footer>`;
  if (page !== "profile" && !(page === "library" && !user)) renderGrid();
  updateSync();
}
function homeHTML() {
  return `<section class="quiet-hero"><div><span class="overline">${t("tagline")}</span><h1>${t("heroTitle")}</h1><p>${t("heroCopy")}</p><div class="hero-buttons"><button class="button primary" data-action="explore">${t("explore")} ${icon("arrow")}</button><button class="button soft" data-action="random">${icon("shuffle")} ${t("random")}</button></div></div><div class="hero-book"><img src="assets/frieren.jpg" alt="${esc(title(anime[0]))}"><span>yooickuu<br>アニメと日常</span></div></section><section class="section"><div class="section-head"><h2>${t("continue")}</h2>${user ? '<button class="sync-state" id="sync-state" data-action="retry-sync"></button>' : ""}</div><div class="continue-grid" id="continue-grid">${continueHTML()}</div></section>`;
}
function continueHTML() {
  const map = new Map();
  Object.values(state.progress)
    .filter((p) => p && byId(p.id) && p.time > 0)
    .sort((a, b) => b.updated - a.updated)
    .forEach((p) => {
      if (!map.has(p.id)) map.set(p.id, p);
    });
  const entries = [...map.values()].slice(0, 4);
  return user && entries.length
    ? entries
        .map((p) => {
          const a = byId(p.id);
          return `<button class="continue-card" data-watch="${a.id}" data-episode="${p.episode}"><img class="continue-poster" src="${esc(cover(a))}" data-poster="${esc(a.id)}" alt=""><div class="continue-info"><h3>${esc(title(a))}</h3><p>${t("episode")} ${p.episode} · ${p.completed ? t("viewed") : timeLabel(p.time) + " / " + timeLabel(p.duration)}</p><div class="progress-track"><span style="width:${Math.min(100, Math.max(0, (p.time / p.duration) * 100))}%"></span></div></div><span class="resume-play">${icon("play")}</span></button>`;
        })
        .join("")
    : `<div class="welcome-card"><div class="welcome-icon">${icon("play")}</div><div><h3>${t("continueEmpty")}</h3><p>${t("continueHint")}</p><button class="text-button" data-watch="sintel">${t("tryPlayer")} ${icon("arrow")}</button></div></div><div class="welcome-card tip"><div class="welcome-icon">${icon("bookmark")}</div><div><h3>${t("libraryGuest")}</h3><p>${t("privateLists")}</p><button class="text-button" data-nav="library">${t("library")} ${icon("arrow")}</button></div></div>`;
}
function guestHTML() {
  return `<section class="guest-panel"><span class="guest-symbol">${icon("bookmark")}</span><h1>${t("libraryGuest")}</h1><p>${t("guestCopy")}</p><button class="button primary" data-action="login">${t("login")}</button><button class="button soft" data-action="register">${t("register")}</button></section>`;
}
function catalogShell() {
  const collection = state.collections.find((c) => c.id === list),
    status = state.statuses.find((s) => s.id === list);
  const heading =
    page === "library"
      ? collection?.name || (status ? statusName(status) : t("library"))
      : t("catalog");
  return `<div class="library-layout ${page === "library" ? "with-sidebar" : ""}">${page === "library" ? `<aside class="library-sidebar"><h3>${t("library")}</h3><button class="list-nav ${list === "all" ? "active" : ""}" data-list="all">${t("allStories")} <span>${savedCount()}</span></button>${state.statuses.map((s) => `<button class="list-nav ${list === s.id ? "active" : ""}" data-list="${esc(s.id)}">${esc(statusName(s))}<span>${Object.values(state.entries).filter((e) => (s.id === "favorites" ? e.favorite : e.status === s.id)).length}</span></button>`).join("")}<button class="text-button" data-action="manage-statuses">${icon("settings")} ${t("manageStatuses")}</button><div class="sidebar-heading">${t("myCollections")}</div>${state.collections.map((c) => `<button class="list-nav ${list === c.id ? "active" : ""}" data-list="${esc(c.id)}">${esc(c.name)} <span>${c.items.length}</span></button>`).join("")}<button class="text-button" data-action="create-collection">${icon("plus")} ${t("createCollection")}</button></aside>` : ""}<section class="section catalog-section" id="catalog"><div class="section-head"><div><h2>${esc(heading)}</h2></div>${collection ? `<div><button class="text-button" data-edit-collection="${esc(collection.id)}">${t("rename")}</button><button class="text-button danger" data-delete-collection="${esc(collection.id)}">${t("remove")}</button></div>` : `<label class="sort-label">${t("order")} <select id="sort" aria-label="${t("order")}">${(page === "library" ? ["picked", "newest", "alphabetical"] : ["picked", "hiddenGems", "latest", "newest", "oldest"]).map((v) => `<option value="${v}" ${sort === v ? "selected" : ""}>${t(v)}</option>`).join("")}</select></label>`}</div>${list === "ongoing" ? `<p class="notice">${t("ongoingHint")}</p>` : ""}<label class="catalog-search"><input id="catalog-search" type="search" placeholder="${t("search")}" aria-label="${t("search")}" value="${esc(query)}"></label><div class="catalog-options">${page !== "library" ? `<select id="catalog-scope" aria-label="${t("catalogScope")}"><option value="all" ${catalogScope==="all"?"selected":""}>${t("allCatalogues")}</option><option value="watchable" ${catalogScope==="watchable"?"selected":""}>${t("videoCatalogue")}</option></select>` : ""}<select id="type-filter" aria-label="${t("allTypes")}">${[
    ["all", "allTypes"],
    ["series", "series"],
    ["MOVIE", "movies"],
    ["OVA,OAD", "ova"],
    ["ONA,WEB", "webSeries"],
    ["SPECIAL", "specials"],
  ]
    .map(
      ([v, k]) =>
        `<option value="${v}" ${typeFilter === v ? "selected" : ""}>${t(k)}</option>`,
    )
    .join(
      "",
    )}</select><label><input type="checkbox" id="ongoing-only" ${ongoingOnly ? "checked" : ""}> ${t("ongoingOnly")}</label></div><div class="filters" role="group" aria-label="${t("catalog")}"><button class="chip ${genre === "all" ? "selected" : ""}" data-genre="all" aria-pressed="${genre === "all"}">${t("all")}</button>${Object.entries(
    genreLabels,
  )
    .map(
      ([v, n]) =>
        `<button class="chip ${genre === v ? "selected" : ""}" data-genre="${v}" aria-pressed="${genre === v}">${n[langIndex(lang)]}</button>`,
    )
    .join(
      "",
    )}</div><div id="results-caption" class="results-caption" aria-live="polite"></div><div class="anime-grid" id="anime-grid"></div><div id="catalog-status" class="catalog-status" aria-live="polite"></div><div class="empty" id="empty" hidden><span>${icon("search")}</span><h3>${t("empty")}</h3><p>${t("emptyHint")}</p><button class="button soft" data-action="reset">${t("reset")}</button></div></section></div>`;
}
function genreText(g) {
  return genreLabels[g]?.[langIndex(lang)] || g || "";
}
function renderGrid() {
  const grid = $("#anime-grid");
  if (!grid) return;
  let items = (
    page === "library"
      ? [
          ...new Map(
            [...anime, ...remoteAnime.values()].map((a) => [a.id, a]),
          ).values(),
        ]
      : onlineItems.length
        ? onlineItems
        : catalogError
          ? anime
          : []
  ).filter((a) => {
    const e = state.entries[a.id],
      c = state.collections.find((c) => c.id === list);
    return (
      (page !== "library" ||
        (list === "all"
          ? !!e
          : c
            ? c.items.includes(a.id)
            : list === "favorites"
              ? !!e?.favorite
              : e?.status === list)) &&
      (page !== "library" && !catalogError || (
        (genre === "all" || a.genres.includes(genre)) &&
        (!ongoingOnly || a.ongoing) &&
        (typeFilter === "all" || (typeFilter === "series" ? ["TV","ONA","WEB"] : typeFilter.split(",")).includes(a.type || (a.episodes === 1 ? "MOVIE" : "TV"))) &&
        [a.title,a.alt,...Object.values(a.translations||{}).map(v=>v[0])].join(" ").toLocaleLowerCase().replaceAll("ё","е").includes(query.toLocaleLowerCase().replaceAll("ё","е").trim())
      ))
    );
  });
  if (sort === "newest") items.sort((a, b) => b.year - a.year);
  if (sort === "alphabetical")
    items.sort((a, b) => title(a).localeCompare(title(b), lang));
  grid.innerHTML = items
    .map((a) => {
      const e = state.entries[a.id];
      return `<article class="anime-card"><button class="poster-button" data-details="${a.id}" aria-label="${t("details")}: ${esc(title(a))}"><img src="${esc(cover(a))}" data-poster="${esc(a.id)}" alt="${esc(title(a))}" loading="lazy">${a.ongoing ? `<span class="ongoing-badge" title="${t("ongoingTooltip")}" aria-label="${t("ongoingTooltip")}"><i></i>${t("airing")}</span>` : ""}${a.catalogOnly ? `<span class="catalog-only-badge">${t("catalogOnly")}</span>` : ""}<span class="poster-play">${icon("play")}</span><span class="poster-label">${a.type === "MOVIE" || (!a.providerId && a.episodes === 1) ? t("movie") : a.episodes ? a.episodes + " " + t("episodes") : t("announced")}</span></button><button class="save-button ${e ? "saved" : ""}" data-details="${a.id}" aria-label="${t("status")}: ${esc(title(a))}">${bookmark}</button><button class="anime-title" data-details="${a.id}">${esc(title(a))}</button><p class="anime-meta">${a.year} · ${esc(genreText(a.genres[0]))}${e?.rating ? " · " + e.rating + "/10" : ""}</p></article>`;
    })
    .join("");
  $("#empty").hidden = items.length > 0 || catalogBusy;
  const status = $("#catalog-status");
  if (status)
    status.innerHTML =
      page === "library"
        ? ""
        : catalogBusy
          ? `<p>${t("loading")}</p>`
          : catalogError
            ? `<p>${t("fallback")}</p><button class="button soft" data-action="reload-catalog">${t("retry")}</button>`
            : `${catalogPartial ? `<p>${t("partialCatalog")}</p>` : ""}<div class="catalog-pagination"><button class="button soft" data-catalog-page="${catalogPage-1}" ${catalogPage<=1?"disabled":""}>${t("previous")}</button><form id="catalog-page-form"><label>${t("page")} <input name="page" type="number" inputmode="numeric" min="1" max="${catalogPages}" value="${catalogPage}" aria-label="${t("page")}" required> / ${catalogPages}</label><button class="icon-button" aria-label="${t("goPage")}">${icon("arrow")}</button></form><button class="button soft" data-catalog-page="${catalogPage+1}" ${catalogPage>=catalogPages?"disabled":""}>${t("nextPage")}</button></div>${catalogPage < catalogPages ? `<button class="text-button" data-action="load-more">${t("loadMore")}</button>` : ""}`;
  $("#results-caption").textContent =
    query || genre !== "all" || page === "library"
      ? `${t("found")}: ${page === "library" || catalogError ? items.length : (catalogTotal ?? items.length).toLocaleString(lang)}`
      : "";
}
function profileHTML() {
  if (!user) return guestHTML();
  const p = state.preferences, stats = profileStats(state);
  return `<section class="profile-page"><div class="section-head"><div><h1>${t("profile")}</h1></div><button class="button soft" data-action="logout">${t("logout")}</button></div>${dataError ? `<p class="form-error">${t("readError")}</p><button class="button soft" data-action="reload-profile">${t("retry")}</button>` : ""}<div class="profile-grid"><div class="profile-card"><div class="profile-avatar">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="${t("profile")}">` : esc((p.name || user.email || "u").slice(0, 1).toUpperCase())}</div><button class="text-button" data-action="avatar">${t("avatar")}</button><input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><h2>${esc(p.name || user.user_metadata?.name || "yooickuu")}</h2><p class="profile-email">${esc(user.email || user.phone || "")}</p><p class="bio-preview">${esc(p.bio)}</p><div class="profile-stats"><span><strong>${savedCount()}</strong>${t("library")}</span><span><strong>${state.collections.length}</strong>${t("myCollections")}</span><span><strong>${stats.completedEpisodes}</strong>${t("completedEpisodes")}</span><span><strong>${stats.averageRating}</strong>${t("averageRating")}</span></div><button class="text-button" data-action="export">${icon("download")} ${t("export")}</button></div><div class="profile-fields"><form id="profile-form"><label>${t("nickname")}<input name="name" value="${esc(p.name || user.user_metadata?.name || "")}" maxlength="40" required placeholder="${t("nameHint")}"></label><label>${t("bio")}<textarea name="bio" maxlength="240" rows="3">${esc(p.bio)}</textarea></label><div class="form-row"><label>${t("language")}<select name="language">${[
    ["ru", "Русский"],
    ["en", "English"],
    ["ja", "日本語"],
  ]
    .map(
      ([v, n]) =>
        `<option value="${v}" ${lang === v ? "selected" : ""}>${n}</option>`,
    )
    .join(
      "",
    )}</select></label><label>${t("theme")}<select name="theme"><option value="light" ${theme === "light" ? "selected" : ""}>${t("light")}</option><option value="dark" ${theme === "dark" ? "selected" : ""}>${t("dark")}</option></select></label></div><button class="button primary">${t("save")}</button></form><h3>${t("playerSettings")}</h3>${preferencesHTML()}<button class="sync-state" id="sync-state" data-action="retry-sync"></button></div></div></section>`;
}
function preferencesHTML() {
  return `<div class="preferences-list">${["autoSkip", "autoNext", "autoPlay"].map((k) => `<label class="toggle-row"><span>${t(k)}</span><input type="checkbox" data-preference="${k}" ${state.preferences[k] ? "checked" : ""}><span class="toggle-track"></span></label>`).join("")}</div>`;
}
async function openDetails(id) {
  let a = byId(id);
  if (!a) return;
  if (a.providerId || a.animeVostId || a.kitsuId) {
    try {
      a = await resolveRelease(a);
    } catch {
      toast(t("providerError"));
    }
  }
  detailId = id;
  const e = state.entries[id] || {};
  $("#details").className = "details-dialog";
  $("#details").innerHTML =
    closeButton("details") +
    `<div class="details-layout"><img class="details-poster" src="${esc(cover(a))}" data-poster="${esc(a.id)}" alt="${esc(title(a))}"><div class="details-copy"><span class="overline">${a.year} · ${a.type === "MOVIE" || (!a.providerId && a.episodes === 1) ? t("movie") : a.episodes ? a.episodes + " " + t("episodes") : t("announced")}</span><h2>${esc(title(a))}</h2><div class="details-tags">${a.genres.map((g) => `<span>${esc(genreText(g))}</span>`).join("")}</div><p class="details-description">${esc(descriptionFor(a, lang))}</p>${a.ongoing ? `<p class="airing-line"><i></i>${t("ongoingTooltip")}</p>` : ""}${a.catalogOnly ? `<p class="availability-note">${t("catalogNoVideo")}</p>` : `<button class="button primary" data-watch="${a.id}">${icon("play")} ${t("watch")}</button>`}${
      user && ready
        ? `<div class="detail-library"><label>${t("status")}<select id="detail-status"><option value="">${t("none")}</option>${state.statuses
            .filter((s) => s.id !== "favorites")
            .map(
              (s) =>
                `<option value="${esc(s.id)}" ${e.status === s.id ? "selected" : ""}>${esc(statusName(s))}</option>`,
            )
            .join(
              "",
            )}</select></label>${state.statuses.some((s) => s.id === "favorites") ? `<button class="button soft" data-favorite="${id}" aria-pressed="${!!e.favorite}">${icon("star") + " " + t(e.favorite ? "removeFavorite" : "addFavorite")}</button>` : ""}<label>${t("rating")}<select id="detail-rating"><option value="0">${t("notRated")}</option>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${e.rating === i + 1 ? "selected" : ""}>${i + 1} / 10</option>`).join("")}</select></label><label>${t("notes")}<textarea id="detail-notes" maxlength="500" rows="2" placeholder="${t("notesHint")}">${esc(e.notes || "")}</textarea></label><button class="text-button" data-action="save-notes">${t("save")}</button><h4>${t("addCollection")}</h4>${state.collections.length ? state.collections.map((c) => `<label class="collection-check"><input type="checkbox" data-collection-item="${esc(c.id)}" ${c.items.includes(id) ? "checked" : ""}>${esc(c.name)}</label>`).join("") : `<p class="notice">${t("noCollections")}</p>`}${state.entries[id] ? `<button class="text-button danger" data-remove-entry="${id}">${t("removeFromList")}</button>` : ""}</div>`
        : `<button class="text-button" data-action="login">${t("authRequired")} ${icon("arrow")}</button>`
    }</div></div>`;
  if (!$("#details").open) $("#details").showModal();
}
function authDialog(mode = "login", method = "email") {
  authMode = mode;
  authMethod = method;
  $$("dialog[open]").forEach((d) => d.close());
  drawAuth();
  $("#auth-dialog").showModal();
}
function drawAuth() {
  const cfg = window.YORU_CONFIG || {},
    disabled = !configured;
  $("#auth-dialog").className = "auth-dialog";
  $("#auth-dialog").innerHTML =
    closeButton("auth-dialog") +
    `<span class="overline">yooickuu</span><h2>${t(authMode === "register" ? "register" : authMode === "reset" ? "resetPassword" : authMode === "newPassword" ? "newPassword" : "login")}</h2>${disabled ? `<div class="setup-notice"><strong>${t("authNotConfigured")}</strong><p>${t("authSetupHint")}</p>${["localhost","127.0.0.1"].includes(location.hostname)?`<a class="text-button" href="setup.html" target="_blank" rel="noopener">${t("setupGuide")}</a>`:""}</div>` : ""}<div class="auth-tabs"><button class="chip ${authMethod === "email" ? "selected" : ""}" data-auth-method="email">${t("email")}</button><button class="chip ${authMethod === "phone" ? "selected" : ""}" data-auth-method="phone">${t("phone")}</button></div><form id="auth-form">${authMethod === "phone" ? `<label>${t("phone")}<input name="phone" type="tel" autocomplete="tel" placeholder="+7 700 123 45 67" value="${esc(phoneNumber)}" required ${authMode === "otp" ? "readonly" : ""}></label><p class="notice">${t("phoneHint")}</p>${!cfg.phoneAuth ? `<p class="form-error">${t("phoneDisabled")}</p>` : ""}${authMode === "otp" ? `<label>${t("code")}<input name="token" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required></label>` : ""}` : `${authMode === "register" ? `<label>${t("nickname")}<input name="name" autocomplete="nickname" maxlength="40" required></label>` : ""}${authMode !== "newPassword" ? `<label>${t("email")}<input name="email" type="email" autocomplete="email" placeholder="you@icloud.com" required></label>` : ""}${authMode !== "reset" ? `<label>${t(authMode === "newPassword" ? "newPassword" : "password")}<input name="password" type="password" autocomplete="${authMode === "login" ? "current-password" : "new-password"}" minlength="${authMode === "login" ? "1" : "8"}" maxlength="128" required></label>${authMode !== "login" ? `<p class="notice">${t("passwordHint")}</p>` : ""}` : ""}`}<p class="form-error" id="auth-message" role="status"></p><button class="button primary full-width" ${disabled || (authMethod === "phone" && !cfg.phoneAuth) ? "disabled" : ""}>${authMethod === "phone" ? t(authMode === "otp" ? "verifyCode" : "sendCode") : t(authMode === "register" ? "register" : authMode === "reset" ? "resetPassword" : authMode === "newPassword" ? "save" : "login")}</button></form>${authMethod === "email" && authMode !== "newPassword" ? `<div class="auth-links"><button class="text-button" data-auth-mode="${authMode === "register" ? "login" : "register"}">${t(authMode === "register" ? "login" : "register")}</button><button class="text-button" data-auth-mode="reset">${t("forgot")}</button></div>` : ""}<button class="button apple-button full-width" data-action="apple" ${disabled ? "disabled" : ""}>${t("apple")}</button>${!cfg.appleAuth ? `<p class="notice">${t("appleDisabled")}</p>` : ""}`;
}
function requireUser() {
  if (!user) {
    authDialog();
    return false;
  }
  if (!ready) {
    toast(t("readError"));
    return false;
  }
  return true;
}
function errorText(error) {
  const key=authErrorKey(error);
  if(key)return t(key);
  return dictionaries[lang][error?.message] || t("requestError");
}
async function submitAuth(form) {
  if (authBusy || !configured) return;
  authBusy = true;
  const data = new FormData(form),
    button = form.querySelector("button");
  button.disabled = true;
  button.textContent = t("loading");
  let result;
  try {
    const redirect = location.origin + location.pathname;
    if (authMethod === "phone") {
      if (authMode === "otp")
        result = await client.auth.verifyOtp({
          phone: phoneNumber,
          token: String(data.get("token")),
          type: "sms",
        });
      else {
        phoneNumber = String(data.get("phone")).replace(/[\s()-]/g, "");
        if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) throw Error("phoneInvalid");
        result = await client.auth.signInWithOtp({ phone: phoneNumber });
        if (result.error) throw result.error;
        authMode = "otp";
        drawAuth();
        return;
      }
    } else if (authMode === "register") {
      result = await client.auth.signUp({
        email: String(data.get("email")),
        password: String(data.get("password")),
        options: {
          data: { name: String(data.get("name")) },
          emailRedirectTo: redirect,
        },
      });
      if (!result.error && !result.data.session) {
        $("#auth-message").textContent = t("checkEmail");
        return;
      }
    } else if (authMode === "reset") {
      result = await client.auth.resetPasswordForEmail(
        String(data.get("email")),
        { redirectTo: redirect },
      );
      if (!result.error) {
        $("#auth-message").textContent = t("resetEmail");
        return;
      }
    } else if (authMode === "newPassword") {
      result = await client.auth.updateUser({
        password: String(data.get("password")),
      });
      if (!result.error) toast(t("passwordUpdated"));
    } else
      result = await client.auth.signInWithPassword({
        email: String(data.get("email")),
        password: String(data.get("password")),
      });
    if (result.error) throw result.error;
    $("#auth-dialog").close();
  } catch (error) {
    $("#auth-message").textContent = errorText(error);
  } finally {
    authBusy = false;
    const b = $("#auth-form button");
    if (b) {
      b.disabled = false;
      b.textContent =
        authMethod === "phone"
          ? t(authMode === "otp" ? "verifyCode" : "sendCode")
          : t(
              authMode === "register"
                ? "register"
                : authMode === "reset"
                  ? "resetPassword"
                  : authMode === "newPassword"
                    ? "save"
                    : "login",
            );
    }
  }
}
function draftKey() {
  return user ? "yooickuu.pending." + user.id : "";
}
function persistDraft() {
  try {
    if (user) sessionStorage.setItem(draftKey(), JSON.stringify(operations));
  } catch {}
}
function updateSync() {
  const el = $("#sync-state");
  if (el) {
    el.textContent = syncFailure
      ? t("syncError")
      : syncBusy || operations.length
        ? t("syncing")
        : t("synced");
    el.classList.toggle("error", syncFailure);
  }
}
function mutate(op) {
  if (!requireUser()) return false;
  if (
    op.type === "collectionItem" &&
    op.add &&
    (byId(op.id)?.providerId || byId(op.id)?.animeVostId || byId(op.id)?.kitsuId) &&
    !state.entries[op.id]
  ) {
    mutate({ type: "entry", id: op.id, patch: { anime: byId(op.id) } });
  }
  if (op.type === "entry" && (byId(op.id)?.providerId || byId(op.id)?.animeVostId || byId(op.id)?.kitsuId))
    op.patch = { ...op.patch, anime: byId(op.id) };
  if (op.type === "progress" && (byId(op.value.id)?.providerId || byId(op.value.id)?.animeVostId || byId(op.value.id)?.kitsuId))
    op.value.anime = byId(op.value.id);
  try {
    state = applyOperation(state, op);
  } catch (error) {
    toast(errorText(error));
    return false;
  }
  operations.push(op);
  persistDraft();
  updateSync();
  flush();
  return true;
}
let flushing = null;
function flush() {
  if (flushing) return flushing;
  if (!user || !ready || !operations.length) return Promise.resolve();
  const uid = user.id;
  flushing = (async () => {
    syncBusy = true;
    syncFailure = false;
    updateSync();
    try {
      while (operations.length && user?.id === uid) {
        const op = operations[0];
        const next = await saveOperation(uid, op);
        if (user?.id !== uid) return;
        operations.shift();
        state = operations.reduce((s, o) => applyOperation(s, o), next);
        persistDraft();
      }
    } catch {
      syncFailure = true;
    } finally {
      syncBusy = false;
      flushing = null;
      updateSync();
    }
  })();
  return flushing;
}
async function avatarLoad() {
  if (!user || !state.preferences.avatar) {
    avatarUrl = "";
    return;
  }
  const uid = user.id;
  const { data } = await client.storage
    .from("avatars")
    .createSignedUrl(state.preferences.avatar, 3600);
  if (user?.id === uid) avatarUrl = data?.signedUrl || "";
}
async function loadProfile() {
  const generation = ++authGeneration;
  try {
    const result = await loadData(user.id);
    if (generation !== authGeneration) return;
    state = normalize(result.data);
    for (const e of [
      ...Object.values(state.entries),
      ...Object.values(state.progress),
    ])
      if (e.anime) registerAnime(e.anime);
    let pending = [];
    try {
      pending = JSON.parse(sessionStorage.getItem(draftKey()) || "[]");
    } catch {}
    operations = Array.isArray(pending) ? pending : [];
    for (const op of operations) {
      const snapshot=op.patch?.anime||op.value?.anime;
      if(snapshot)registerAnime(snapshot);
      try {
        state = applyOperation(state, op);
      } catch {
        operations = operations.filter((x) => x !== op);
      }
    }
    ready = true;
    dataError = false;
    lang = dictionaries[state.preferences.language]
      ? state.preferences.language
      : lang;
    theme = state.preferences.theme === "dark" ? "dark" : "light";
    await avatarLoad();
    if (generation !== authGeneration) return;
    render();
    flush();
  } catch {
    if (generation !== authGeneration) return;
    ready = false;
    dataError = true;
    render();
    toast(t("readError"));
  }
}
function clearMedia() {
  for (const file of mediaFiles.values()) URL.revokeObjectURL(file.url);
  mediaFiles.clear();
}
async function handleSession(session, event) {
  const next = session?.user || null;
  if (next?.id === user?.id) {
    if (event === "PASSWORD_RECOVERY") authDialog("newPassword");
    return;
  }
  if ($("#player-dialog").open) $("#player-dialog").close();
  ++sourceGeneration;
  clearMedia();
  user = next;
  state = defaults();
  operations = [];
  ready = false;
  dataError = false;
  avatarUrl = "";
  syncFailure = false;
  ++authGeneration;
  render();
  if (user) await loadProfile();
  if (event === "PASSWORD_RECOVERY") authDialog("newPassword");
}
function collectionDialog(mode, id) {
  if (!requireUser()) return;
  const statusMode = mode.includes("status"),
    deleting = mode.startsWith("delete"),
    editing = mode.startsWith("rename");
  const item = statusMode
    ? state.statuses.find((s) => s.id === id)
    : state.collections.find((c) => c.id === id);
  $("#collection-dialog").className = "small-dialog";
  $("#collection-dialog").innerHTML =
    closeButton("collection-dialog") +
    `<h2>${deleting ? t("remove") : editing ? t("rename") : t(statusMode ? "createStatus" : "createCollection")}</h2><form id="collection-form" data-mode="${mode}" data-id="${esc(id || "")}">${deleting ? `<p>${t(statusMode ? "deleteStatusHint" : "deleteCollectionHint")}</p><strong>${esc(statusMode ? statusName(item) : item.name)}</strong>` : `<label>${t(statusMode ? "statusName" : "collectionName")}<input name="name" maxlength="60" required value="${esc(item ? (statusMode ? statusName(item) : item.name) : "")}"></label>`}<div class="form-actions"><button type="button" class="button soft" data-close="collection-dialog">${t("cancel")}</button><button class="button primary">${t(deleting ? "remove" : editing ? "save" : "create")}</button></div></form>`;
  $("#collection-dialog").showModal();
}
function manageStatuses() {
  if (!requireUser()) return;
  $("#collection-dialog").className = "small-dialog";
  $("#collection-dialog").innerHTML =
    closeButton("collection-dialog") +
    `<h2>${t("manageStatuses")}</h2><div class="manage-statuses">${state.statuses.map((s) => `<div><span>${esc(statusName(s))}</span><button class="text-button" data-rename-status="${esc(s.id)}">${t("rename")}</button><button class="text-button danger" data-delete-status="${esc(s.id)}">${t("remove")}</button></div>`).join("")}</div><button class="button primary" data-action="create-status">${icon("plus")} ${t("createStatus")}</button>`;
  $("#collection-dialog").showModal();
}
function submitCollection(form) {
  const mode = form.dataset.mode,
    id = form.dataset.id || crypto.randomUUID(),
    name = new FormData(form).get("name");
  const types = {
    "create-collection": "createCollection",
    "rename-collection": "renameCollection",
    "delete-collection": "deleteCollection",
    "create-status": "createStatus",
    "rename-status": "renameStatus",
    "delete-status": "deleteStatus",
  };
  if (mutate({ type: types[mode], id, name })) {
    if (mode.startsWith("delete") && list === id) list = "all";
    $("#collection-dialog").close();
    render();
    toast(t("saved"));
  }
}
function latestProgress(id) {
  return Object.values(state.progress)
    .filter((p) => p?.id === id)
    .sort((a, b) => b.updated - a.updated)[0];
}
function playerHTML() {
  return `<div class="player-top"><h2 id="player-title"></h2><button class="icon-button" data-close="player-dialog" aria-label="${t("close")}">${icon("close")}</button></div><div class="player-pickers"><span id="season-control" hidden><select id="season-picker" aria-label="${t('season')}"></select></span><span id="episode-control"><select id="episode-picker" aria-label="${t('episode')}"></select></span></div><div class="player-layout"><div class="player-main"><div class="video-shell" tabindex="0" aria-label="${t('videoControls')}"><div class="video-wrap"><video id="video" playsinline preload="metadata"></video><div id="source-empty" hidden><h3>${t('videoError')}</h3><button class="button primary" data-action="retry-video">${t('retry')}</button></div></div>${controlsHTML(t,{speed:state.preferences.speed})}</div><div class="episode-nav"><button class="button soft" id="previous-episode" data-action="previous">${icon('previous')} ${t('previousEpisode')}</button><button class="button soft" id="next-episode" data-action="next">${t('next')} ${icon('next')}</button></div><p id="source-status" class="notice" aria-live="polite"></p><details class="player-settings"><summary>${t('playerSettings')}</summary>${preferencesHTML()}${current.id==='sintel'?'':`<button class="text-button" data-action="choose-file">${t('chooseFile')}</button>`}</details><button class="sync-state" id="sync-state" data-action="retry-sync"></button></div></div><input type="file" id="video-file" accept="video/*,.mkv" multiple hidden>`;
}
async function openPlayer(id, requested) {
  if (!requireUser() || playerOpening) return;
  let a = byId(id);
  if (!a) return;
  playerOpening = true;
  if (a.providerId || a.animeVostId || a.kitsuId) {
    try {
      a = await resolveRelease(a);
    } catch {
      toast(t("providerError"));
      playerOpening = false;
      return;
    }
    if (a.catalogOnly) {toast(t("catalogNoVideo"));playerOpening=false;return;}
    if (a.blocked) {
      toast(t("providerBlocked"));
      playerOpening = false;
      return;
    }
  }
  if ((a.providerId || a.animeVostId) && !a.episodes) {toast(t("noReleasedEpisodes"));playerOpening=false;return;}
  if (!user || !ready) {playerOpening=false;return;}
  try {
    recordProgress();
    $$("dialog[open]:not(#player-dialog)").forEach((d) => d.close());
    playback?.destroy();
    playback = null;
    current = a;
    playerSeasons = [a];
    episode = Math.min(
      a.episodes,
      Math.max(1, requested || latestProgress(id)?.episode || 1),
    );
    $("#player-dialog").innerHTML = playerHTML();
    if (!$("#player-dialog").open) $("#player-dialog").showModal();
    attachVideo();
    renderEpisodes();
    const playerId = current.id;
    releaseSeasons(a).then(items=>{if(current?.id===playerId && $("#player-dialog").open){playerSeasons=items;renderEpisodes();}}).catch(()=>{});
    await updateSource(true);
  } finally {
    playerOpening = false;
  }
}
function renderEpisodes() {
  if (!current || !$("#episode-picker")) return;
  $("#episode-control").hidden = current.episodes <= 1;
  $("#episode-picker").innerHTML = Array.from({length:current.episodes},(_,i)=>`<option value="${i+1}" ${i+1===episode?'selected':''}>${t('episode')} ${esc(current.episodeNumbers?.[i] ?? i+1)}</option>`).join('');
  $("#season-control").hidden = playerSeasons.length <= 1;
  $("#season-picker").innerHTML = playerSeasons.map(a=>`<option value="${esc(a.id)}" ${a.id===current.id?'selected':''}>${esc(title(a))}</option>`).join('');
  const navigation=episodeNavigation(episode,current.episodes);
  $("#previous-episode").hidden=!navigation.previous;
  $("#next-episode").hidden=!navigation.next;
  enhanceSelects($("#player-dialog"));
}
let recordReady = false;
async function updateSource(play = false, refresh = false, alternate = false) {
  const generation = ++sourceGeneration;
  sourceKey = null;
  recordReady = false;
  skipDone = false;
  endingSkipped = false;
  providerTiming = null;
  const video = $("#video");
  if (!video || !current) return;
  playback?.destroy();
  let availableSources=[],attemptedURLs=new Set();
  playback = createPlayback(video, status=>{
    if(generation!==sourceGeneration || !$("#player-dialog").open)return;
    const loading=$(".video-loading");
    if(loading)loading.hidden=!['loading','buffering'].includes(status);
    if(['error','unsupported'].includes(status)){
      const fallback=availableSources.find(s=>!attemptedURLs.has(s.url));
      if(fallback){
        attemptedURLs.add(fallback.url);
        $('#quality').value=String(fallback.quality);enhanceSelects($('#player-dialog'));
        const saved=state.progress[sourceKey];
        playback.load({url:fallback.url,stream:fallback.url.includes('.m3u8'),autoplay:play,startAt:video.currentTime||(saved&&!saved.completed?saved.time:0),speed:Number(state.preferences.speed)||1});return;
      }
      if(current.providerId && current.animeVostId && !alternate && !mediaFiles.has(sourceKey)){recordProgress();updateSource(play,true,true);return;}
      $("#source-empty").hidden=false;
      $("#source-status").textContent=t(status==='unsupported'?'videoUnsupported':'videoError');
    }else if(status==='autoplayBlocked'){
      if(loading)loading.hidden=true;
    }else if(['ready','playing'].includes(status)){
      $("#source-empty").hidden=true;
      $("#source-status").textContent=current.id==='sintel'?'Sintel · Blender Foundation · CC BY 3.0':'';
    }
  });
  sourceKey = `${current.id}:${episode}`;
  const file = mediaFiles.get(sourceKey);
  $("#player-title").textContent=title(current);
  $("#source-status").textContent='';
  $("#source-empty").hidden=true;
  $(".video-loading").hidden=false;
  $("#quality-control").hidden=true;
  renderEpisodes();
  let url=null,stream=false;
  try {
    if(file)url=file.url;
    else if(current.id==='sintel')url='assets/sintel-trailer.mp4';
    else if(current.providerId || current.animeVostId){
      const info=await videoEpisode(current,episode,refresh,alternate);
      if(generation!==sourceGeneration)return;
      providerTiming=info;
      availableSources=info?.sources||[];
      const selected=chooseQuality(info?.sources||[],state.preferences.quality);
      url=selected?.url;stream=info?.stream!==false;
      if(info?.sources?.length){
        $("#quality-control").hidden=false;
        $("#quality").innerHTML=info.sources.map(q=>`<option value="${q.quality}" ${q.quality===selected?.quality?'selected':''}>${q.quality}p</option>`).join('');
        enhanceSelects($("#player-dialog"));
      }
    }else url=await mediaSource(current.id,episode);
    if(generation!==sourceGeneration || !user)return;
    if(!url)throw Error('noSource');
    const saved=state.progress[sourceKey];
    attemptedURLs.add(url);
    playback.load({url,stream:stream||url.includes('.m3u8'),autoplay:play,startAt:saved&&!saved.completed?saved.time:0,speed:Number(state.preferences.speed)||1});
  }catch(error){
    if(generation!==sourceGeneration)return;
    $(".video-loading").hidden=true;
    $("#source-empty").hidden=false;
    $("#source-status").textContent=t(error.message==='providerBlocked'?'providerBlocked':error.message==='noSource'?'noSource':'videoError');
  }
}
function recordProgress() {
  const video = $("#video");
  if (
    !user ||
    !ready ||
    !current ||
    !sourceKey ||
    !recordReady ||
    !video ||
    !Number.isFinite(video.duration) ||
    video.duration <= 0
  )
    return;
  const value = {
    id: current.id,
    episode,
    time: video.currentTime,
    duration: video.duration,
    completed: video.ended || video.currentTime >= video.duration - 0.5,
    updated: Date.now(),
  };
  const last = state.progress[sourceKey];
  if (
    last &&
    Math.abs(last.time - value.time) < 0.4 &&
    last.completed === value.completed
  )
    return;
  mutate({ type: "progress", key: sourceKey, value });
}
async function switchEpisode(n, play = false) {
  if (!current || n < 1 || n > current.episodes) return;
  recordProgress();
  episode = n;
  await updateSource(play);
}
function attachVideo() {
  const video = $("#video");
  attachControls($(".video-shell"), video, t, () => toast(t("playerActionError")));
  video.addEventListener("loadedmetadata", () => {
    if (!sourceKey) return;
    const p = state.progress[sourceKey];
    if (p && !p.completed && p.time < video.duration)
      video.currentTime = p.time;
    video.playbackRate = Number(state.preferences.speed) || 1;
    recordReady = true;
  });
  video.addEventListener("play", () => {
    if (!current || current.id === "sintel") return;
    const entry = state.entries[current.id];
    if (!entry?.status && state.statuses.some((s) => s.id === "watching"))
      mutate({ type: "entry", id: current.id, patch: { status: "watching" } });
  });
  video.addEventListener("timeupdate", () => {
    if (!recordReady) return;
    const target = skipTarget(
      video.currentTime,
      providerTiming?.opening,
      state.preferences.autoSkip,
      skipDone,
      video.duration,
    );
    if (target !== null) {
      skipDone = true;
      video.currentTime = target;
      toast(t("introSkipped"));
    }
    const endingTarget = skipTarget(
      video.currentTime,
      providerTiming?.ending,
      state.preferences.autoSkip,
      endingSkipped,
      video.duration + 0.1,
    );
    if (endingTarget !== null) {
      endingSkipped = true;
      video.currentTime = Math.min(video.duration, endingTarget);
    }
    if (Date.now() - lastProgress > 5000) {
      recordProgress();
      lastProgress = Date.now();
    }
  });
  video.addEventListener("pause", recordProgress);
  video.addEventListener("ended", () => {
    recordProgress();
    renderEpisodes();
    if (
      current.id !== "sintel" && !current.ongoing &&
      Array.from(
        { length: current.episodes },
        (_, i) => state.progress[`${current.id}:${i + 1}`]?.completed,
      ).every(Boolean) &&
      state.statuses.some((s) => s.id === "completed")
    )
      mutate({ type: "entry", id: current.id, patch: { status: "completed" } });
    const next = nextEpisodeAction(
      state.preferences,
      episode,
      current.episodes,
      mediaFiles.has(`${current.id}:${episode + 1}`) ||
        hasRemoteSource(current.id, episode + 1) ||
        !!(current.providerId || current.animeVostId),
    );
    if (next) switchEpisode(next.episode, next.play);
  });
  video.addEventListener("error", () => {
    if (video.getAttribute("src") && sourceKey) {
      $("#source-status").textContent = t("videoError");
      toast(t("videoError"));
    }
  });
}
$("#player-dialog").addEventListener("close", () => {
  recordProgress();
  sourceKey = null;
  recordReady = false;
  ++sourceGeneration;
  playback?.destroy();
  playback = null;
  closeSelectMenu();
  const v = $("#video");
  if (v) v.pause();
  $("#player-dialog").classList.remove("cinema");
  if ($("#continue-grid")) $("#continue-grid").innerHTML = continueHTML();
});
function chooseFiles() {
  if (current?.id === "sintel") {
    toast(t("contentNotice"));
    return;
  }
  $("#video-file")?.click();
}
function selectFiles(input) {
  if (!user || !current) return;
  const selected = Array.from(input.files).slice(
    0,
    current.episodes - episode + 1,
  );
  if (!selected.length) return;
  recordProgress();
  selected.forEach((file, i) => {
    const key = `${current.id}:${episode + i}`,
      old = mediaFiles.get(key);
    if (old) URL.revokeObjectURL(old.url);
    mediaFiles.set(key, { name: file.name, url: URL.createObjectURL(file) });
  });
  input.value = "";
  updateSource();
  toast(t("filesLoaded") + ": " + selected.length);
}
async function uploadAvatar(file) {
  if (!requireUser() || !file) return;
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 20971520
  ) {
    toast(t("avatarInputError"));
    return;
  }
  const uid=user.id;
  let cropped;
  try {cropped=await cropAvatar(file,t);}catch{toast(t('avatarInputError'));return;}
  if(!cropped || user?.id!==uid)return;
  if(cropped.size>2097152){toast(t('avatarError'));return;}
  const path=`${uid}/${crypto.randomUUID()}.png`;
  const {error}=await client.storage.from('avatars').upload(path,cropped,{contentType:'image/png',upsert:false});
  if (error) {
    toast(t("requestError"));
    return;
  }
  if (user?.id !== uid) return;
  mutate({ type: "preferences", patch: { avatar: path } });
  await avatarLoad();
  render();
}
function showAbout() {
  $("#about-dialog").className = "about-dialog";
  $("#about-dialog").innerHTML =
    closeButton("about-dialog") +
    `<span class="overline">yooickuu</span><h2>${t("about")}</h2><p>${t("aboutCopy")}</p><p>${t("sources")}<br><a href="https://animevost.org" target="_blank" rel="noopener noreferrer">AnimeVost</a> · <a href="https://kitsu.app" target="_blank" rel="noopener noreferrer">Kitsu</a> · <a href="https://aniliberty.top" target="_blank" rel="noopener noreferrer">AniLiberty</a>.</p><button class="button primary" data-close="about-dialog">${t("close")}</button>`;
  $("#about-dialog").showModal();
}
document.addEventListener("click", async (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.close) $("#" + b.dataset.close).close();
    if (b.dataset.nav) navigate(b.dataset.nav);
    if (b.dataset.list) navigate("library", b.dataset.list);
    if (b.dataset.details) {b.disabled=true;try{await openDetails(b.dataset.details);}finally{b.disabled=false;}}
    if (b.dataset.catalogPage) {await loadCatalogue(false,Number(b.dataset.catalogPage));$("#catalog")?.scrollIntoView({behavior:"smooth"});}
    if (b.dataset.watch)
      await openPlayer(b.dataset.watch, Number(b.dataset.episode) || undefined);
    if (b.dataset.selectEpisode)
      await switchEpisode(Number(b.dataset.selectEpisode));
    if (b.dataset.genre) {
      genre = b.dataset.genre;
      $$("[data-genre]").forEach((x) => {
        x.classList.toggle("selected", x.dataset.genre === genre);
        x.setAttribute("aria-pressed", x.dataset.genre === genre);
      });
      renderGrid();
      if (page !== "library") loadCatalogue();
    }
    if (b.dataset.favorite) {
      if (
        mutate({
          type: "entry",
          id: b.dataset.favorite,
          patch: { favorite: !state.entries[b.dataset.favorite]?.favorite },
        })
      ) {
        openDetails(b.dataset.favorite);
        renderGrid();
      }
    }
    if (b.dataset.removeEntry) {
      mutate({ type: "removeEntry", id: b.dataset.removeEntry });
      openDetails(b.dataset.removeEntry);
      renderGrid();
    }
    if (b.dataset.authMode) authDialog(b.dataset.authMode);
    if (b.dataset.authMethod) {
      authMethod = b.dataset.authMethod;
      authMode = "login";
      drawAuth();
    }
    if (b.dataset.editCollection)
      collectionDialog("rename-collection", b.dataset.editCollection);
    if (b.dataset.deleteCollection)
      collectionDialog("delete-collection", b.dataset.deleteCollection);
    if (b.dataset.renameStatus) {
      $("#collection-dialog").close();
      collectionDialog("rename-status", b.dataset.renameStatus);
    }
    if (b.dataset.deleteStatus) {
      $("#collection-dialog").close();
      collectionDialog("delete-status", b.dataset.deleteStatus);
    }
    switch (b.dataset.action) {
      case "theme":
        theme = theme === "light" ? "dark" : "light";
        if (user && ready) mutate({ type: "preferences", patch: { theme } });
        render();
        break;
      case "login":
        authDialog();
        break;
      case "register":
        authDialog("register");
        break;
      case "logout":
        recordProgress();
        await flush();
        {const {error}=await client.auth.signOut();if(error)throw error;}
        break;
      case "apple":
        if (!window.YORU_CONFIG?.appleAuth) {
          toast(t("appleDisabled"));
          break;
        }
        {
          const { error } = await client.auth.signInWithOAuth({
            provider: "apple",
            options: { redirectTo: location.origin + location.pathname },
          });
          if (error) toast(errorText(error));
        }
        break;
      case "explore":
        $("#catalog")?.scrollIntoView({ behavior: "smooth" });
        break;
      case "random":
        {
          const pool = onlineItems.length ? onlineItems : anime;
          openDetails(pool[Math.floor(Math.random() * pool.length)].id);
        }
        break;
      case "about":
        showAbout();
        break;
      case "load-more":
        loadCatalogue(true);
        break;
      case "reload-catalog":
        loadCatalogue();
        break;
      case "reset":
        query = "";
        genre = "all";
        typeFilter = "all";
        ongoingOnly = false;
        loadCatalogue();
        const search = $("#search");
        if (search) search.value = "";
        render();
        break;
      case "create-collection":
        collectionDialog("create-collection");
        break;
      case "manage-statuses":
        manageStatuses();
        break;
      case "create-status":
        $("#collection-dialog").close();
        collectionDialog("create-status");
        break;
      case "retry-sync":
        if (syncFailure) flush();
        break;
      case "reload-profile":
        await loadProfile();
        break;
      case "save-notes":
        if (
          mutate({
            type: "entry",
            id: detailId,
            patch: { notes: $("#detail-notes").value },
          })
        )
          toast(t("saved"));
        break;
      case "choose-file":
        chooseFiles();
        break;
      case "cinema":
        $("#player-dialog").classList.toggle("cinema");
        b.setAttribute('aria-pressed',String($("#player-dialog").classList.contains('cinema')));
        break;
      case "retry-video":
        recordProgress();
        await updateSource(true,true);
        break;
      case "previous":
        await switchEpisode(episode - 1, !!state.preferences.autoPlay);
        break;
      case "next":
        await switchEpisode(episode + 1, !!state.preferences.autoPlay);
        break;
      case "avatar":
        $("#avatar-file").click();
        break;
      case "export":
        {
          if (!requireUser()) break;
          const blob = new Blob(
              [
                JSON.stringify(
                  {
                    version: 2,
                    exportedAt: new Date().toISOString(),
                    data: state,
                  },
                  null,
                  2,
                ),
              ],
              { type: "application/json" },
            ),
            url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = "yooickuu-lists.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        break;
    }
  } catch (error) {
    toast(errorText(error));
  }
});
document.addEventListener("input", (event) => {
  if (["search", "catalog-search"].includes(event.target.id)) {
    query = event.target.value;
    if (page === "profile" || page === "library") {
      page = "catalog";
      render();
      const input = $("#search");
      input.focus();
    }
    for(const input of $$("#search,#catalog-search"))if(input!==event.target)input.value=query;
    renderGrid();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadCatalogue(), 350);
  }
});
document.addEventListener("change", (event) => {
  const input = event.target;
  if (input.id === "catalog-scope") {catalogScope=input.value;loadCatalogue();}
  if (input.id === "language") {
    lang = input.value;
    if (user && ready)
      mutate({ type: "preferences", patch: { language: lang } });
    render();
  }
  if (input.id === "sort") {
    sort = input.value;
    renderGrid();
    if (page !== "library") loadCatalogue();
  }
  if (input.id === "type-filter") {
    typeFilter = input.value;
    renderGrid();
    loadCatalogue();
  }
  if (input.id === "ongoing-only") {
    ongoingOnly = input.checked;
    renderGrid();
    loadCatalogue();
  }
  if (input.id === "detail-status") {
    mutate({
      type: "entry",
      id: detailId,
      patch: { status: input.value || null },
    });
    renderGrid();
  }
  if (input.id === "detail-rating") {
    mutate({
      type: "entry",
      id: detailId,
      patch: { rating: Number(input.value) },
    });
    renderGrid();
  }
  if (input.dataset.collectionItem)
    mutate({
      type: "collectionItem",
      collectionId: input.dataset.collectionItem,
      id: detailId,
      add: input.checked,
    });
  if (input.dataset.preference)
    mutate({
      type: "preferences",
      patch: { [input.dataset.preference]: input.checked },
    });
  if (input.id === "episode-picker") switchEpisode(Number(input.value),!!state.preferences.autoPlay);
  if (input.id === "season-picker") openPlayer(input.value);
  if (input.id === "quality") {
    const v=$("#video"),play=!!v && !v.paused;
    recordProgress();
    if(mutate({type:'preferences',patch:{quality:Number(input.value)}}))updateSource(play);
  }
  if (input.id === "speed") {
    const speed = Number(input.value);
    if ($("#video")) $("#video").playbackRate = speed;
    mutate({ type: "preferences", patch: { speed } });
  }
  if (input.id === "video-file") selectFiles(input);
  if (input.id === "avatar-file") { const file=input.files[0];input.value="";uploadAvatar(file); }
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target,
    data = new FormData(form);
  if (form.id === "catalog-page-form") {const n=Number(data.get("page"));if(Number.isInteger(n)&&n>=1&&n<=catalogPages){loadCatalogue(false,n);$("#catalog")?.scrollIntoView({behavior:"smooth"});}return;}
  if (form.id === "auth-form") submitAuth(form);
  if (form.id === "collection-form") submitCollection(form);
  if (form.id === "profile-form") {
    const patch = {
      name: String(data.get("name")).trim(),
      bio: String(data.get("bio")).trim(),
      language: String(data.get("language")),
      theme: String(data.get("theme")),
    };
    if (!patch.name) return;
    if (mutate({ type: "preferences", patch })) {
      lang = patch.language;
      theme = patch.theme;
      render();
      toast(t("profileSaved"));
    }
  }

});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (!$$("dialog").some((d) => d.open)) $("#search")?.focus();
    return;
  }
  const v = $("#video");
  if (
    !$("#player-dialog").open ||
    !v ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName) ||
    event.target === v
  )
    return;
  const key = event.key.toLowerCase();
  if ([" ", "arrowleft", "arrowright", "f", "m"].includes(key)) {
    event.preventDefault();
    if (!v.getAttribute("src")) return;
    if (key === " ")
      v.paused ? v.play().catch(() => toast(t("noAutoplay"))) : v.pause();
    if (key === "arrowleft") v.currentTime = Math.max(0, v.currentTime - 10);
    if (key === "arrowright" && Number.isFinite(v.duration))
      v.currentTime = Math.min(v.duration, v.currentTime + 10);
    if (key === "m") v.muted = !v.muted;
    if (key === "f") {
      if (document.fullscreenElement)
        document.exitFullscreen?.().catch(() => {});
      else $(".video-shell")?.requestFullscreen?.().catch(() => {});
    }
  }
});
$$("dialog").forEach((d) =>
  d.addEventListener("click", (event) => {
    if (event.target !== d) return;
    const r = d.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      d.close();
  }),
);
window.addEventListener("hashchange", fromHash);
window.addEventListener("pagehide", () => {
  recordProgress();
  persistDraft();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    recordProgress();
    persistDraft();
  }
});
window.addEventListener("online", flush);
initSelectMenus();
fromHash();
loadCatalogue();
if (client) {
  client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => handleSession(session, event), 0);
  });
  client.auth
    .getSession()
    .then(({ data }) => handleSession(data.session, "INITIAL_SESSION"))
    .catch(() => toast(t("requestError")));
}

async function loadCatalogue(more = false, targetPage = 1) {
  clearTimeout(searchTimer);
  if (page === "library" || page === "profile") return;
  const generation = ++catalogGeneration;
  catalogBusy = true;
  catalogError = false;
  if (!more) {
    onlineItems = [];
  }
  renderGrid();
  try {
    const result = await combinedCatalogue({
      scope: catalogScope,
      query,
      page: more ? catalogPage + 1 : targetPage,
      genre,
      sort,
      type: typeFilter,
      ongoing: ongoingOnly,
    });
    if (generation !== catalogGeneration) return;
    onlineItems = more ? [...new Map([...onlineItems, ...result.items].map(a=>[a.id,a])).values()] : result.items;
    catalogPage = more ? catalogPage + 1 : targetPage;
    catalogTotal = result.total;
    catalogPartial = result.partial;
    catalogPages = result.pages;
  } catch {
    if (generation !== catalogGeneration) return;
    catalogError = true;
  } finally {
    if (generation === catalogGeneration) {
      catalogBusy = false;
      renderGrid();
    }
  }
}

document.addEventListener("error", event => {
  const img=event.target;
  if(img.tagName!=="IMG" || !img.dataset.poster)return;
  const a=byId(img.dataset.poster);
  if(a?.posterFallback && img.src!==a.posterFallback && !img.dataset.retried){img.dataset.retried="true";img.src=a.posterFallback;}
},true);
