import {savedIds,savedCards,libraryPage,loadSavedCards} from './library-view.js';
import {retrySourceRequest} from './source-retry.js';
import {discoveryOptions} from './catalog-query.js';
import promoSlides from './promo.json';
import {episodeSeasonOptions,firstMainEpisode,seasonMenu,seasonNavigation} from './catalog-seasons.js';
import {normalizeGenre,matchesType,searchScore,suggestions} from './catalog-query.js';
import {approvedSkipTimes} from './approved-skip-times.js';
import {detailArtwork} from './detail-artwork.js';
import {soundPreferences,preferredAudio,resumeTime} from './playback-preferences.js';
import {within,nextHero,fadeHero} from './hero-rotation.js';
import {revealSurfaces} from './motion.js';
import {applyGuestPlaybackOperation} from './guest-playback.js';
import {styles,normalizeStyle,styleColors} from './appearance.js';
import {eveningPlan} from './evening-plan.js';
import {improvePoster} from './image-quality.js';
import artwork from './artwork.json';

import {accountVault} from './account-switcher.js';
import {playerShortcut} from './player-shortcuts.js';
import {signInIdentifier} from './login.js';
import {checkNickname,nicknameErrorKey,nicknameChecker} from './nicknames.js';
import {savedEpisodeNumber,savedEpisodeIndex} from './episode-manifest.js';
import {createProfileDraft, createAvatarLoader} from './profile.js';
let socialModule,socialPageCleanup,socialCommentCleanup,socialPageVersion=0,socialCommentVersion=0,socialCommentKey='',socialCommentObserver;
const chatsLabel=()=>({ru:'Чаты',en:'Chats',ja:'チャット'}[lang]);
const commentsLabel=()=>({ru:'Комментарии',en:'Comments',ja:'コメント'}[lang]);
const loadSocial=async()=>socialModule ||= await import(new URL(__SOCIAL_ASSET__,document.baseURI).href);
function socialContext(active){return {client,user:()=>user,lang:()=>lang,active,canPoll:()=>page!=='watch',login:()=>authDialog(),confirm:async text=>window.confirm(text),preferences:()=>state.preferences,profileReady:()=>ready,title,cover,details:openDetails,card:id=>resolveRelease({id}),searchAnime:async query=>(await combinedCatalogue({query,page:1})).items.slice(0,8)};}
function resetSocialComments(){
 const key=current?`${current.id}:${current.episodeManifest?.[episode-1]?.season??1}:${current.episodeManifest?.[episode-1]?.ordinal??episode}:${user?.id||''}:${lang}`:'';
 if(key===socialCommentKey)return;socialCommentKey=key;++socialCommentVersion;socialCommentCleanup?.();socialCommentCleanup=null;
 socialCommentObserver?.disconnect();
 const root=$('#episode-comments');if(!root)return;root.innerHTML=`<p class="notice">${commentsLabel()}…</p>`;
 if('IntersectionObserver' in window){socialCommentObserver=new IntersectionObserver(entries=>{if(key!==socialCommentKey)return;if(entries.some(e=>e.isIntersecting)){socialCommentObserver.disconnect();void openSocialComments();}},{rootMargin:'160px'});socialCommentObserver.observe(root);}else void openSocialComments();
}
async function openSocialComments(){
 const root=$('#episode-comments');if(!root||!current)return;
 const own=++socialCommentVersion,a=current,row=a.episodeManifest?.[episode-1],key={anime:a.id,season:row?.season??1,episode:row?.ordinal??episode};
 root.textContent=t('loading');const ctx=socialContext(()=>own===socialCommentVersion);
 try{const module=await loadSocial();if(!ctx.active())return;const cleanup=await module.mountComments(root,ctx,key);if(ctx.active())socialCommentCleanup=cleanup;else cleanup();}catch{if(ctx.active())root.textContent=t('providerError');}
}
let unreadCount=0,notificationCleanup;
function updateUnread(count){unreadCount=count;const badge=$('#chat-unread');if(badge){badge.textContent=String(count||'');badge.hidden=!count;}}
async function startNotifications(){notificationCleanup?.();notificationCleanup=null;updateUnread(0);const uid=user?.id;if(!uid||user.is_anonymous)return;try{const module=await loadSocial();if(user?.id!==uid)return;notificationCleanup=await module.notifications(socialContext(()=>user?.id===uid),updateUnread);}catch{}}
let unifiedProfileKey='',unifiedProfilePending;
async function syncMainProfile(){
 if(!user||!ready)return;const uid=user.id,key=JSON.stringify([uid,state.preferences.avatar,state.preferences.banner,state.preferences.bio,state.preferences.historyPublic]);
 if(unifiedProfileKey===key)return;if(unifiedProfilePending){await unifiedProfilePending;if(user?.id===uid)return syncMainProfile();return;}
 unifiedProfilePending=(async()=>{await flush();if(user?.id!==uid||operations.length)return;const module=await loadSocial();await module.syncProfile(socialContext(()=>user?.id===uid));if(user?.id===uid)unifiedProfileKey=key;})();
 try{await unifiedProfilePending;}finally{unifiedProfilePending=null;}
}
let watchView;
let consumetModule, englishSubtitlesCleanup;
const externalAudio=id=>id==='consumet:dub'||id==='consumet:sub';
const loadConsumet=async()=>consumetModule ||= await import(new URL(__CONSUMET_ASSET__,document.baseURI).href);
function playerAudioChoices(a,episode){
 const stored=audioChoices(a,episode);
 return a.catalogApproved&&(a.ids?.mal||a.malId)?[...stored,{id:'consumet:dub',label:'English Dub',language:'en',onDemand:true},{id:'consumet:sub',label:'English Sub',language:'ja',onDemand:true}]:stored;
}
import {attachPlaybackAutomation} from './playback-automation.js';
import {automaticSkipTimes} from './autoskip.js';
import {discoveryChoice,watchRoute,audioChoices} from './discovery.js';
import {initSelectMenus, enhanceSelects, closeSelectMenu} from './select-menu.js';
import {createPlayback} from './playback.js';
import {cropAvatar,cropBanner} from './avatar-crop.js';
import {authErrorKey} from "./public-config.js";
import {combinedCatalogue, resolveRelease, videoEpisode, findWatchRelease, discoveryIndex, prepareEpisodeAudio, publishedItems, isPublished, releaseSeasons, knownSeasons, catalogueYears} from "./sources.js";
import {icon} from "./icons.js";
import {controlsHTML, attachControls} from "./player-controls.js";
import { chooseQuality } from "./provider.js";
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
  catalogPartial = false, catalogScope = "all", catalogueView = "all",
  catalogPages = 1,
  catalogBusy = false,
  catalogError = false,
  catalogGeneration = 0,
  searchTimer,
  typeFilter = "all", yearFilter = "all", ratingFilter = "0",
  ongoingOnly = false,
  playback = null,
  controlsCleanup = null,
  automationCleanup = null,
  playerSeasons = [],
  seasonGroup = 'main',
  providerTiming = null;
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
let appearance = normalizeStyle(read("yooickuu.appearance", "graphite"));
let eveningMinutes = 30, eveningMode = "all";
let theme = "dark",
  state = normalize({preferences:read("yooickuu.guest-player", {})}),
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
  lastProgress = 0,
  playerOpening = false,
  selectedAudio = '',
  authResolved = !client,
  heroTimer = null, heroIndex = 0, featuredItems = [], randomBusy = false, randomHistory = [];
const t = (key) => dictionaries[lang][key] || key;
const title = (a) => (a?.id === "sintel" ? t("demo") : titleFor(a, lang));
const statusName = (s) => s.name || t(s.key || s.id);
publishedItems.forEach(registerAnime);
const brand = () =>
  `<a href="#home" class="brand" aria-label="yomiku · ${t('home')}"><img class="brand-symbol" src="assets/yomiku-mark.svg?v=2" alt="" width="44" height="44"><span class="brand-wordmark"><span class="brand-kana" aria-hidden="true">ヨミク</span><span class="brand-name">yomiku</span></span></a>`;
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
  document.body.classList.add("dark");
  document.body.dataset.style = appearance;
  const mark='assets/yomiku-mark.svg?v=2';
  document.querySelector('link[rel="icon"]')?.setAttribute('href',mark);
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href',`assets/yomiku-touch.png?v=2`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',styleColors[appearance]);
  document.title = "yomiku — " + ({ru:"аниме, фильмы и личные списки",en:"anime, films and personal lists",ja:"アニメ・映画・マイリスト"}[lang]);
  try {
    localStorage.setItem("yooickuu.language", JSON.stringify(lang));
    localStorage.setItem("yooickuu.appearance", JSON.stringify(appearance));
  } catch {}
}
function navigate(next, selected = "all") {
  if(next==='library'){typeFilter='all';ongoingOnly=false;}
  if(page==='watch')stopWatching();
  page = next;
  list = selected;
  query = "";
  genre = "all";
  location.hash =
    next === "library" && selected !== "all"
      ? `library/${encodeURIComponent(selected)}`
      : next;
  render();
  if (['home','catalog'].includes(next)) loadCatalogue();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function fromHash() {
  if(/^#(?:social(?:\/|$)|user\/|chat\/)/.test(location.hash)){if(current)stopWatching();page='social';render();return;}
  const route=watchRoute(location.hash);
  if(route){
    page='watch';
    if(current?.id===route.id && $('#video')){if(episode!==route.episode)await switchEpisode(route.episode,false);return;}
    render();
    if(authResolved && (!user || ready))await openPlayer(route.id,route.episode,false);
    return;
  }
  if(current)stopWatching();
  const hash=location.hash.slice(1).split('/');
  page=['home','catalog','library','profile'].includes(hash[0])?hash[0]:'home';
  try{list=decodeURIComponent(hash[1]||'all');}catch{list='all';}
  render();
}
function savedCount() {
  return Object.keys(state.entries).length;
}
function render(newWatch=false) {
  ++socialPageVersion;socialPageCleanup?.();socialPageCleanup=null;
  const preservedWatch=page==='watch'&&!newWatch?$('#watch-page'):null;
  clearInterval(heroTimer);
  applyAppearance();
  const markup =
    `<header class="header">${brand()}<nav aria-label="${t("catalog")}">${["home", "catalog", "library"].map((v) => `<button class="nav-link ${page === v ? "active" : ""}" data-nav="${v}">${icon({home:"screen",catalog:"search",library:"bookmark"}[v])}<span>${t(v)}</span></button>`).join("")}<a class="nav-link ${page==='social'&&location.hash.includes('chat')?'active':''}" href="#social/chats">${chatsLabel()}<span id="chat-unread" class="chat-unread" ${unreadCount?'':'hidden'}>${unreadCount||''}</span></a></nav><div class="header-tools"><label class="search"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input id="search" type="search" placeholder="${t("search")}" aria-label="${t("search")}" value="${esc(query)}"><kbd>⌘ K</kbd></label><select id="language" aria-label="${t("language")}">${[
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
      )}</select>${user ? `<button class="avatar" data-nav="profile" aria-label="${t("profile")}">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="">` : esc((state.preferences.name || user.email || "u").slice(0, 1).toUpperCase())}</button>` : `<button class="button primary login-button" data-action="login">${t("login")}</button>`}</div></header><main class="page-${page} ${page==='watch'?'watch-container':page==='home'?'home-container':''}">${page === "home" ? homeHTML() : ""}${page==='social'?`<div id="social-root">${t('loading')}</div>`:page==='watch' ? (current ? playerHTML() : `<p class="watch-loading">${t('loading')}</p>`) : page === "profile" ? profileHTML() : page === "library" && !user ? guestHTML() : page==='home'?recommendationsShell():catalogShell()}</main><footer>${brand()}<button data-action="about">${t("about")}</button></footer>`;
  if(preservedWatch){
    // Replacing the app root detaches the fullscreen element, even if reinserted.
    const template=document.createElement('template');template.innerHTML=markup;
    for(const tag of ['header','footer'])$('#app > '+tag)?.replaceWith(template.content.querySelector(tag));
  }else $("#app").innerHTML=markup;
  if(page==='home')startHero();
  if (page !== 'social' && page !== 'watch' && page !== "profile" && !(page === "library" && !user)) renderGrid();
  if(page==='social'){const own=socialPageVersion,root=$('#social-root'),ctx=socialContext(()=>own===socialPageVersion);loadSocial().then(async module=>{if(ctx.active()){const cleanup=await module.mountPage(root,ctx,location.hash.slice(1));if(ctx.active())socialPageCleanup=cleanup;else cleanup();}}).catch(()=>{if(ctx.active())root.textContent=t('providerError');});}
  if(page==='profile'&&user&&ready)void syncMainProfile().catch(()=>{});
  updateSync();
  revealSurfaces(document.querySelector('main'));
  document.dispatchEvent(new Event('yomiku:navigation'));
}
function homeHTML() {
 return `<section class="cinematic-hero" id="hero-art">${heroArtHTML()}</section><section class="section"><div class="section-head"><h2>${t('continue')}</h2>${user?'<button class="sync-state" id="sync-state" hidden data-action="retry-sync"></button>':''}</div><div class="continue-grid" id="continue-grid">${continueHTML()}</div></section>`;
}
function bannerFor(a){return a?.catalogApproved?detailArtwork(a):(artwork[a?.malId]?.banner||a?.banner||'');}
const spotlightItems=promoSlides;
spotlightItems.forEach(registerAnime);
function heroPool(){return spotlightItems;}
function heroImage(a){return matchMedia('(max-width:600px)').matches?(a.heroMobile||a.image):(a.hero||bannerFor(a));}
function heroArtHTML(){
 const pool=heroPool(),front=pool[heroIndex%pool.length];if(!front)return `<div class="hero-content"><span class="hero-eyebrow">yomiku</span><h1>${t('catalogRebuilding')}</h1><p>${t('catalogRebuildingHint')}</p><button class="button glass-button" data-nav="library">${t('library')}</button></div>`;
 return `<picture class="hero-picture ${front.heroHeight>front.heroWidth?'hero-portrait':'hero-wide'}"><source media="(max-width:600px)" srcset="${esc(front.heroMobile||front.image)}"><img class="hero-backdrop" src="${esc(front.hero||bannerFor(front))}" alt="" fetchpriority="high" decoding="async" width="${front.heroWidth||1600}" height="${front.heroHeight||500}"></picture><div class="hero-shade"></div><div class="hero-content"><span class="hero-eyebrow"><i></i>${front.ongoing?t('airing'):t('spotlight')}</span><h1>${esc(title(front))}</h1><div class="hero-facts"><span>${front.year}</span><span>${esc(genreText(front.genres?.[0]))}</span>${audienceHTML(front)}</div><p>${esc(descriptionFor(front,lang))}</p><div class="hero-buttons"><button class="button primary" data-watch="${esc(front.id)}">${icon('play')} ${t('watch')}</button><button class="button glass-button" data-action="random">${icon('shuffle')} ${t('random')}</button><button class="icon-button glass-button" data-details="${esc(front.id)}" aria-label="${t('details')}">${icon('plus')}</button></div></div>`;
}
const heroImages=new Map();
function prepareHeroImage(url){
 if(!heroImages.has(url)){
  const img=new Image();img.decoding='async';img.src=url;
  heroImages.set(url,within(img.decode(),4500).then(()=>img).catch(error=>{heroImages.delete(url);throw error;}));
 }
 return heroImages.get(url);
}
function preloadNextHero(){
 const pool=heroPool(),next=pool[(heroIndex+1)%pool.length];
 if(next)void prepareHeroImage(heroImage(next)).catch(()=>{});
}
async function rotateHero(direction=1){
 const node=$('#hero-art'),pool=heroPool();if(!node||node.dataset.rotating||pool.length<2)return;
 node.dataset.rotating='true';
 try{
  const candidate=await nextHero(pool,heroIndex,direction,a=>prepareHeroImage(heroImage(a)));
  if(!candidate)return;
  const next=candidate.item;
  if(!node.isConnected||document.hidden||node.querySelector(':focus-visible')||$('dialog[open]'))return;
  const currentPool=heroPool(),nextIndex=currentPool.findIndex(a=>a.id===next.id);
  if(nextIndex<0)return;
  const previous=node.querySelector('.hero-picture');
  heroIndex=nextIndex;node.innerHTML=heroArtHTML();
  if(previous&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   // Keep the decoded outgoing image visible until the new artwork is ready.
   previous.classList.add('hero-outgoing');node.prepend(previous);previous.style.zIndex='1';
   fadeHero(previous);
  }
  preloadNextHero();
 }catch{}finally{delete node.dataset.rotating;}
}
function startHero(){
 clearInterval(heroTimer);
 preloadNextHero();
 // Reduced-motion users still get rotation, without cross-fade animation.
 heroTimer=setInterval(()=>{const node=$('#hero-art');if(node&&!document.hidden&&!node.querySelector(':focus-visible')&&!$('dialog[open]'))rotateHero();},7000);
}
function continueHTML() {
  const map = new Map();
  Object.values(state.progress)
    .filter((p) => p && isPublished(p.id) && byId(p.id) && p.time > 0)
    .sort((a, b) => b.updated - a.updated)
    .forEach((p) => {
      if (!map.has(p.id)) map.set(p.id, p);
    });
  const entries = [...map.values()].slice(0, 4);
  return user && entries.length
    ? entries
        .map((p) => {
          const a = byId(p.id);
          return `<button class="continue-card" data-watch="${a.id}" data-episode="${p.episode}"><img class="continue-poster" src="${esc(cover(a))}" data-poster="${esc(a.id)}" alt=""><div class="continue-info"><h3>${esc(title(a))}</h3><p>${t("episode")} ${esc(savedEpisodeNumber(p))} · ${p.completed ? t("viewed") : timeLabel(p.time) + " / " + timeLabel(p.duration)}</p><div class="progress-track"><span style="width:${Math.min(100, Math.max(0, (p.time / p.duration) * 100))}%"></span></div></div><span class="resume-play">${icon("play")}</span></button>`;
        })
        .join("")
    : `<div class="welcome-card"><div class="welcome-icon">${icon("play")}</div><div><h3>${t("continueEmpty")}</h3><p>${t("continueHint")}</p></div></div><div class="welcome-card tip"><div class="welcome-icon">${icon("bookmark")}</div><div><h3>${t("libraryGuest")}</h3><p>${t("privateLists")}</p><button class="text-button" data-nav="library">${t("library")} ${icon("arrow")}</button></div></div>`;
}
function guestHTML() {
  return `<section class="guest-panel"><span class="guest-symbol">${icon("bookmark")}</span><h1>${t("libraryGuest")}</h1><p>${t("guestCopy")}</p><button class="button primary" data-action="login">${t("login")}</button><button class="button soft" data-action="register">${t("register")}</button></section>`;
}
function recommendationsShell(){
 return `<section class="section recommendations"><div class="section-head"><h2>${t('recommended')}</h2><button class="text-button" data-nav="catalog">${t('exploreCatalog')} ${icon('arrow')}</button></div><div class="anime-grid" id="anime-grid"></div><div id="catalog-status" class="catalog-status" aria-live="polite"></div><div id="results-caption" hidden></div><div id="empty" class="empty" hidden>${t('empty')}</div></section>`;
}
function catalogShell() {
  const collection = state.collections.find((c) => c.id === list),
    status = state.statuses.find((s) => s.id === list);
  const heading =
    page === "library"
      ? collection?.name || (status ? statusName(status) : t("library"))
      : t("catalog");
  return `${page==='catalog'?discoveryHTML():''}<div class="library-layout ${page === "library" ? "with-sidebar" : ""}">${page === "library" ? `<aside class="library-sidebar"><h3>${t("library")}</h3><button class="list-nav ${list === "all" ? "active" : ""}" data-list="all">${t("allStories")} <span>${savedCount()}</span></button>${state.statuses.map((s) => `<button class="list-nav ${list === s.id ? "active" : ""}" data-list="${esc(s.id)}">${esc(statusName(s))}<span>${Object.values(state.entries).filter((e) => (s.id === "favorites" ? e.favorite : (e.status === s.id || e.legacyLists?.includes(s.id)))).length}</span></button>`).join("")}<button class="text-button" data-action="manage-statuses">${icon("settings")} ${t("manageStatuses")}</button><button class="text-button" data-action="create-status">${icon("plus")} ${t("createCollection")}</button></aside>` : ""}<section class="section catalog-section" id="catalog"><div class="section-head"><div><h2>${esc(heading)}</h2></div>${collection ? `<div><button class="text-button" data-edit-collection="${esc(collection.id)}">${t("rename")}</button><button class="text-button danger" data-delete-collection="${esc(collection.id)}">${t("remove")}</button></div>` : `<label class="sort-label">${t("order")} <select id="sort" aria-label="${t("order")}">${(page === "library" ? ["picked", "newest", "alphabetical"] : ["picked", "hiddenGems", "latest", "topRated", "newest", "oldest"]).map((v) => `<option value="${v}" ${sort === v ? "selected" : ""}>${t(v)}</option>`).join("")}</select></label>`}</div>${list === "ongoing" ? `<p class="notice">${t("ongoingHint")}</p>` : ""}<label class="catalog-search"><input id="catalog-search" type="search" placeholder="${t("search")}" aria-label="${t("search")}" value="${esc(query)}"></label><div class="catalog-options"><select id="type-filter" aria-label="${t("allTypes")}">${[
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
    )}</select>${page==='catalog'?`<select id="year-filter" aria-label="${t('releaseYear')}"><option value="all">${t('allYears')}</option>${catalogueYears.map(y=>`<option value="${y}" ${String(yearFilter)===String(y)?'selected':''}>${y}</option>`).join('')}</select><select id="rating-filter" aria-label="${t('minimumRating')}">${[0,6,7,8,9].map(n=>`<option value="${n}" ${Number(ratingFilter)===n?'selected':''}>${n?t('ratingFrom')+' '+n:t('anyRating')}</option>`).join('')}</select>`:''}<label><input type="checkbox" id="ongoing-only" ${ongoingOnly ? "checked" : ""}> ${t("ongoingOnly")}</label></div><label class="genre-filter">${t('genre')}<select id="genre-filter"><option value="all">${t('allGenres')}</option>${Object.entries(genreLabels).map(([v,n])=>`<option value="${esc(v)}" ${genre===v?'selected':''}>${n[langIndex(lang)]}</option>`).join('')}</select></label><div id="results-caption" class="results-caption" aria-live="polite"></div><div class="anime-grid" id="anime-grid"></div><div id="catalog-status" class="catalog-status" aria-live="polite"></div><div class="empty" id="empty" hidden><span>${icon("search")}</span><h3>${t("empty")}</h3><p>${t("emptyHint")}</p><button class="button soft" data-action="reset">${t("reset")}</button></div></section></div>`;
}
function genreText(g) {
  return genreLabels[normalizeGenre(g)]?.[langIndex(lang)] || g || "";
}
let libraryKey='',libraryCards=new Map(),libraryBusy=false,libraryFailed=[],libraryPageNumber=1,libraryFilterKey='';
function ensureLibraryCards(){
 const ids=[...new Set([...savedIds(state),...state.collections.flatMap(c=>c.items)])];
 const key=JSON.stringify([user?.id,ids]);
 if(key===libraryKey)return;
 libraryKey=key;libraryCards=new Map();libraryBusy=true;libraryFailed=[];
 void loadSavedCards(ids,resolveRelease,{current:()=>libraryKey===key&&page==='library',onCard:a=>libraryCards.set(a.id,a)}).then(failed=>{
  if(libraryKey!==key)return;
  libraryBusy=false;libraryFailed=failed;
  if(page==='library')renderGrid();else libraryKey='';
 });
}
function renderGrid() {
  const grid = $("#anime-grid");
  if (!grid) return;
  if(page==='library')ensureLibraryCards();
  let items = (
    page === "library"
      ? savedCards(state,list,id=>libraryCards.get(id)||byId(id))
      : onlineItems.length
        ? onlineItems
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
              : (e?.status === list || e?.legacyLists?.includes(list)))) &&
      (page !== "library" && !catalogError || (
        (genre === "all" || a.genres.some(g=>normalizeGenre(g)===normalizeGenre(genre))) &&
        (!ongoingOnly || a.ongoing) &&
        matchesType(a,typeFilter) &&
        searchScore(a,query)>0
      ))
    );
  });
  if (page!=="home" && sort === "newest") items.sort((a, b) => b.year - a.year);
  if (page!=="home" && sort === "alphabetical")
    items.sort((a, b) => title(a).localeCompare(title(b), lang));

  const filterKey=JSON.stringify([user?.id,list,query,genre,typeFilter,ongoingOnly,sort]);
  if(filterKey!==libraryFilterKey){libraryFilterKey=filterKey;libraryPageNumber=1;}
  const libraryResult=libraryPage(items,libraryPageNumber);
  libraryPageNumber=libraryResult.page;
  const renderItems = page==='library'?libraryResult.items:page==='home'?items.slice(0,60):items;

  grid.innerHTML = renderItems
    .map((a) => {
      const e = state.entries[a.id];
      return `<article class="anime-card"><button class="poster-button" data-details="${a.id}" aria-label="${t("details")}: ${esc(title(a))}"><img src="${esc(cover(a))}" data-poster="${esc(a.id)}" alt="${esc(title(a))}" loading="lazy">${a.ongoing ? `<span class="ongoing-badge" title="${t("ongoingTooltip")}" aria-label="${t("ongoingTooltip")}"><i></i>${t("airing")}</span>` : ""}${a.catalogOnly ? `<span class="catalog-only-badge">${t("catalogOnly")}</span>` : ""}<span class="poster-play">${icon("play")}</span><span class="poster-label">${matchesType(a,"MOVIE") ? t("movie") : a.episodes ? a.episodes + " " + t("episodes") : t("announced")}</span></button><button class="save-button ${e ? "saved" : ""}" data-details="${a.id}" aria-label="${t("status")}: ${esc(title(a))}">${bookmark}</button><button class="anime-title" data-details="${a.id}">${esc(title(a))}</button>${audienceHTML(a)}<p class="anime-meta">${a.year} · ${esc(genreText(a.genres[0]))}${e?.rating ? " · " + e.rating + "/10" : ""}</p></article>`;
    })
    .join("");
  revealSurfaces(grid);
  $("#empty").hidden = items.length > 0 || catalogBusy;
  const status = $("#catalog-status");
  if (status)
    status.innerHTML =
      page==='library'
        ? `${libraryBusy?`<p>${t('loading')}</p>`:''}${libraryFailed.length?`<button class="text-button" data-action="reload-library">${t('retry')}</button>`:''}${libraryResult.pages>1?`<div class="catalog-pagination"><button class="button soft" data-library-page="${libraryPageNumber-1}" ${libraryPageNumber<=1?'disabled':''}>${t('previous')}</button><span>${libraryPageNumber} / ${libraryResult.pages}</span><button class="button soft" data-library-page="${libraryPageNumber+1}" ${libraryPageNumber>=libraryResult.pages?'disabled':''}>${t('nextPage')}</button></div>`:''}`
        : page==='home'?""
        : catalogBusy
          ? `<p>${t("loading")}</p>`
          : catalogError
            ? `<p>${t("fallback")}</p><button class="button soft" data-action="reload-catalog">${t("retry")}</button>`
            : `${catalogPartial ? `<p>${t("partialCatalog")}</p>` : ""}<div class="catalog-pagination"><button class="button soft" data-catalog-page="${catalogPage-1}" ${catalogPage<=1?"disabled":""}>${t("previous")}</button><form id="catalog-page-form"><label>${t("page")} <input name="page" type="number" inputmode="numeric" min="1" max="${catalogPages}" value="${catalogPage}" aria-label="${t("page")}" required> / ${catalogPages}</label><button class="icon-button" aria-label="${t("goPage")}">${icon("arrow")}</button></form><button class="button soft" data-catalog-page="${catalogPage+1}" ${catalogPage>=catalogPages?"disabled":""}>${t("nextPage")}</button></div>${catalogPage < catalogPages ? `<button class="text-button" data-action="load-more">${t("loadMore")}</button>` : ""}`;
  $("#results-caption").textContent =
    page === 'catalog' || query || genre !== "all" || page === "library"
      ? `${t("found")}: ${page === "library" || catalogError ? items.length : (catalogTotal ?? items.length).toLocaleString(lang)}`
      : "";
}
const profileDraft = createProfileDraft();
const accounts=accountVault(localStorage);
function profileHTML() {
  if (!user) return guestHTML();
  if (!ready && !dataError) return `<section class="profile-page" aria-busy="true"><h1>${t("profile")}</h1><p role="status">${t("loading")}</p></section>`;
  const p = state.preferences, stats = profileStats(state);
  const draft = {...p, name:p.name || user.user_metadata?.name || "", language:lang, theme, ...profileDraft.get(user.id)};
  return `<section class="profile-page"><div class="profile-banner-stage"><div class="section-head profile-banner-heading"><div><h1>${t("profile")}</h1></div><div class="profile-account-actions"><button class="button soft" data-action="switch-account">${t("switchAccount")}</button><button class="text-button" data-action="logout">${t("logout")}</button></div></div>${dataError ? `<p class="form-error profile-banner-error">${t("readError")}</p><button class="button soft" data-action="reload-profile">${t("retry")}</button>` : ""}<div class="profile-cover"><img class="profile-banner-fill" ${bannerUrl?`src="${esc(bannerUrl)}"`:"hidden"} alt="" aria-hidden="true"><img id="profile-banner-image" ${bannerUrl?`src="${esc(bannerUrl)}"`:'hidden'} alt=""><div class="profile-cover-fade"></div><div class="profile-cover-actions"><button class="icon-button glass-button" data-action="banner" aria-label="${t('profileBanner')}" title="${t('profileBanner')}">${icon('image')}</button>${p.banner?`<button class="icon-button glass-button" data-action="remove-banner" aria-label="${t('removeBanner')}">${icon('close')}</button>`:''}</div><input id="banner-file" type="file" accept="image/jpeg,image/png,image/webp" hidden></div></div><div class="profile-grid"><div class="profile-sidebar"><div class="profile-card"><div class="profile-avatar">${avatarUrl ? `<img src="${esc(avatarUrl)}" alt="${t("profile")}">` : esc((p.name || user.email || "u").slice(0, 1).toUpperCase())}</div><button class="text-button" data-action="avatar">${t("avatar")}</button><input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><h2>${esc(p.name || user.user_metadata?.name || "yomiku")}</h2><p class="profile-email">${esc(user.email || user.phone || "")}</p><p class="bio-preview">${esc(p.bio)}</p><div class="profile-stats"><span><strong>${savedCount()}</strong>${t("savedAnime")}</span><span><strong>${state.statuses.length}</strong>${t("library")}</span><span><strong>${stats.completedEpisodes}</strong>${t("completedEpisodes")}</span><span><strong>${stats.averageRating}</strong>${t("averageRating")}</span></div><div class="profile-social-actions"><a class="button soft" href="#social/people">${({ru:"Найти пользователя",en:"Find people",ja:"ユーザー検索"})[lang]}</a><a class="button soft" href="#social/friends">${({ru:"Друзья",en:"Friends",ja:"友達"})[lang]}</a></div><button class="text-button" data-action="export">${icon("download")} ${t("export")}</button></div>${appearanceHTML()}<div class="profile-preferences"><h2>${t("playerSettings")}</h2>${preferencesHTML()}${window.YORU_CONFIG?.accountDeletion?`<button class="text-button danger" data-action="delete-account">${t("deleteAccount")}</button>`:""}<button class="sync-state" id="sync-state" hidden data-action="retry-sync"></button></div></div><div class="profile-main"><div class="profile-fields"><h2>${t("personalDetails")}</h2><p class="notice">${({ru:"Фото, имя и описание видны другим. Почта видна только вам.",en:"Your photos, name and bio are public. Only you can see your email.",ja:"写真、名前、自己紹介は公開されます。メールアドレスは自分にのみ表示されます。"})[lang]}</p><form id="profile-form"><label>${t("nickname")}<input name="name" value="${esc(draft.name ?? user.user_metadata?.name ?? "")}" maxlength="40" required placeholder="${t("nameHint")}"></label><p class="form-error" data-nickname-message role="status" aria-live="polite"></p><label>${t("bio")}<textarea name="bio" maxlength="240" rows="3">${esc(draft.bio)}</textarea></label><button class="button primary">${t("save")}</button></form></div>${historyHTML()}${eveningHTML()}</div></div></section>`;
}
function appearanceHTML() {
 return `<section class="profile-appearance glass-panel"><div class="panel-heading"><span class="overline">${t('yourAtmosphere')}</span><h2>${t('siteStyle')}</h2></div><div class="style-options" role="group" aria-label="${t('siteStyle')}">${styles.map(id=>`<button class="style-option" data-style-choice="${id}" aria-pressed="${appearance===id}"><span class="style-swatch" data-style="${id}" aria-hidden="true"><i></i><i></i><i></i></span><span>${t('style_'+id)}</span><span class="style-selected" aria-hidden="true">${icon('check')}</span></button>`).join('')}</div></section>`;
}
function eveningHTML() {
 const choices=eveningPlan(state,byId,eveningMinutes,eveningMode).filter(p=>isPublished(p.id));
 return `<section class="profile-evening glass-panel" id="evening-plan"><div class="panel-heading"><span class="overline">${t('aLittleTime')}</span><h2>${t('eveningPlan')}</h2></div><p class="panel-description">${t('eveningHint')}</p><div class="plan-modes" role="group" aria-label="${t('planMode')}">${['all','continue','new'].map(id=>`<button class="chip" data-plan-mode="${id}" aria-pressed="${eveningMode===id}">${t('plan_'+id)}</button>`).join('')}</div><div class="time-options" role="group" aria-label="${t('availableTime')}">${[15,30,60,90,120].map(n=>`<button class="chip" data-plan-minutes="${n}" aria-pressed="${n===eveningMinutes}">${n} ${t('minutesShort')}</button>`).join('')}</div><div class="evening-results" aria-live="polite">${choices.length?choices.map(plan=>{const a=byId(plan.id)||state.entries[plan.id]?.anime||Object.values(state.progress).find(p=>p.id===plan.id)?.anime;return `<button class="evening-option" data-watch="${esc(plan.id)}" data-episode="${plan.start}"><img src="${esc(cover(a))}" alt="" loading="lazy"><span><strong>${esc(title(a))}</strong><small>${t(plan.count>1?'episodes':'episode')} ${plan.ordinal}${plan.count>1?'–'+plan.lastOrdinal:''}</small><small>${plan.estimated?'≈ ':''}${plan.minutes} ${t('minutesShort')}${plan.speed!==1?' · '+plan.speed+'×':''}</small><small class="plan-spare">${t('planSpare')} ${plan.spareMinutes} ${t('minutesShort')}</small></span>${icon('play')}</button>`;}).join(''):`<p class="notice">${t('eveningEmpty')}</p>`}</div>${choices.some(c=>c.estimated)?`<p class="plan-estimate">${t('eveningEstimate')}</p>`:''}</section>`;
}
function historyHTML() {
  const history=Object.values(state.progress).filter(p=>p.id!=='sintel'&&byId(p.id)).sort((a,b)=>(b.updated||0)-(a.updated||0)).slice(0,8);
  return `<section class="profile-history"><div class="profile-history-heading"><h3>${t('history')}</h3><button class="text-button" data-action="history-visibility" aria-pressed="${!!state.preferences.historyPublic}" title="${({ru:"Видимость истории для других пользователей",en:"History visibility for other users",ja:"他のユーザーへの履歴公開"})[lang]}">${state.preferences.historyPublic?({ru:"Скрыть",en:"Hide",ja:"非公開"})[lang]:({ru:"Показать",en:"Show",ja:"公開"})[lang]}</button></div>${history.length?history.map(p=>{const a=byId(p.id);return `<button class="history-item" data-watch="${esc(a.id)}" data-episode="${Number(p.episode)||1}"><img src="${esc(cover(a))}" alt="" loading="lazy"><span><strong>${esc(title(a))}</strong><small>${t('episode')} ${esc(savedEpisodeNumber(p))} · ${timeLabel(p.time)}</small></span>${icon('play')}</button>`;}).join(''):`<p class="notice">${t('historyEmpty')}</p>`}</section>`;
}
function discoveryHTML(){
  return `<section class="discovery-panel"><h1>${t('discover')}</h1><p>${t('discoveryCopy')}</p><div class="discovery-grid">${[['popular','play'],['topRated','star'],['airingNow','screen'],['films','moon']].map(([key,i])=>`<button class="discovery-tile ${catalogueView===key?'selected':''}" data-discover="${key}">${icon(i)}<span>${t(key)}</span>${icon('arrow')}</button>`).join('')}</div></section>`;
}
function audienceHTML(a){
  const score=Number(a.audienceRating);
  return `<span class="audience-rating" title="${t('audienceRating')}">${icon('star')} ${score>0&&score<=10?score.toLocaleString(lang,{minimumFractionDigits:1,maximumFractionDigits:1})+' / 10':t('noAudienceRating')}</span>`;
}
function preferencesHTML() {
  return `<div class="preferences-list">${["autoSkip", "autoNext", "autoPlay"].map((k) => `<label class="toggle-row"><span>${t(k)}</span><input type="checkbox" data-preference="${k}" ${state.preferences[k] ? "checked" : ""}><span class="toggle-track"></span></label>`).join("")}</div>`;
}
async function openDetails(id) {
  let a = byId(id);
  if (!a) return;
  a={...a,catalogOnly:!isPublished(a.id)};
  id = a.id;
  detailId = id;
  const e = state.entries[id] || {};
  $("#details").className = "details-dialog";
  $("#details").innerHTML =
    `<div class="details-toolbar">${closeButton("details")}</div>` +
    `<div class="details-artwork ${bannerFor(a)?'':'portrait-art'}" aria-hidden="true"><img class="details-manga" data-details-art="${esc(a.id)}" src="${esc(detailArtwork(a,artwork))}" alt=""><div class="details-art-shade"></div></div><div class="details-layout"><aside class="details-visual"><img class="details-poster" src="${esc(cover(a))}" data-poster="${esc(a.id)}" alt="${esc(title(a))}">${!a.catalogOnly?`<button class="button primary full-width" data-watch="${a.id}">${icon("play")} ${t("watch")}</button>`:""}<p class="poster-caption">${esc(title(a))}</p></aside><div class="details-copy"><span class="overline">${a.year} · ${matchesType(a,"MOVIE") ? t("movie") : a.episodes ? a.episodes + " " + t("episodes") : t("announced")}</span><h2>${esc(title(a))}</h2>${audienceHTML(a)}<div class="details-tags">${a.genres.map((g) => `<span>${esc(genreText(g))}</span>`).join("")}</div><section class="details-story"><h3>${t("synopsis")}</h3><p class="details-description">${esc(descriptionFor(a, lang))}</p></section>${a.ongoing ? `<p class="airing-line"><i></i>${t("ongoingTooltip")}</p>` : ""}${a.catalogOnly ? `<p class="availability-note">${t("catalogNoVideo")}</p>` : ""}${
      user && ready
        ? `<div class="detail-library"><label>${t("status")}<select id="detail-status"><option value="">${t("none")}</option>${state.statuses
            .filter((s) => s.id !== "favorites")
            .map(
              (s) =>
                `<option value="${esc(s.id)}" ${e.status === s.id ? "selected" : ""}>${esc(statusName(s))}</option>`,
            )
            .join(
              "",
            )}</select></label>${state.statuses.some((s) => s.id === "favorites") ? `<button class="button soft" data-favorite="${id}" aria-pressed="${!!e.favorite}">${icon("star") + " " + t(e.favorite ? "removeFavorite" : "addFavorite")}</button>` : ""}<label>${t("rating")}<select id="detail-rating"><option value="0">${t("notRated")}</option>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${e.rating === i + 1 ? "selected" : ""}>${i + 1} / 10</option>`).join("")}</select></label><label>${t("notes")}<textarea id="detail-notes" maxlength="500" rows="2" placeholder="${t("notesHint")}">${esc(e.notes || "")}</textarea></label><button class="text-button" data-action="save-notes">${t("save")}</button>${state.entries[id] ? `<button class="text-button danger" data-remove-entry="${id}">${t("removeFromList")}</button>` : ""}</div>`
        : `<button class="text-button" data-action="login">${t("authRequired")} ${icon("arrow")}</button>`
    }</div></div>`;
  if (!$("#details").open) $("#details").showModal();
  // Paint existing information immediately; refresh metadata without replacing user's form.
  void resolveRelease(a).then(updated=>{
    if(!$('#details').open||detailId!==id)return;
    if(!updated.catalogOnly&&!updated.blocked&&!$('#details [data-watch]')){
      const button=document.createElement('button');button.className='button primary full-width';button.dataset.watch=updated.id;button.textContent=t('watch');$('#details .details-visual').append(button);
      $('#details .availability-note')?.remove();
    }
    const overline=$('#details .details-copy > .overline');if(overline)overline.textContent=`${updated.year} · ${matchesType(updated,'MOVIE')?t('movie'):updated.episodes?updated.episodes+' '+t('episodes'):t('announced')}`;
    const story=$('#details .details-description');if(story&&descriptionFor(updated,lang))story.textContent=descriptionFor(updated,lang);
  }).catch(()=>{});

}
function authDialog(mode = "login", method = "email") {
  authMode = mode;
  authMethod = method;
  $$("dialog[open]").forEach((d) => d.close());
  drawAuth();
  $("#auth-dialog").showModal();
}
function drawAuth() {
  authMethod='email';
  const registering=authMode==='register',reset=authMode==='reset',newPassword=authMode==='newPassword';
  $('#auth-dialog').className='auth-dialog';
  $('#auth-dialog').innerHTML=closeButton('auth-dialog')+`<span class="overline">yomiku</span><h2>${t(registering?'register':reset?'resetPassword':newPassword?'newPassword':'login')}</h2><form id="auth-form">
  ${registering?`<label>${t('nickname')}<input name="name" autocomplete="nickname" maxlength="40" required></label><p class="form-error" data-nickname-message role="status"></p>`:''}
  ${!newPassword?`<label>${t(authMode==='login'?'loginIdentifier':'email')}<input name="email" type="${authMode==='login'?'text':'email'}" autocomplete="${authMode==='login'?'username':'email'}" autocapitalize="none" spellcheck="false" required></label>`:''}
  ${!reset?`<label>${t('password')}<span class="password-field"><input name="password" type="password" autocomplete="${authMode==='login'?'current-password':'new-password'}" minlength="${authMode==='login'?1:8}" maxlength="128" required><button type="button" class="password-toggle icon-button" data-action="toggle-password" aria-label="${t('showPassword')}" aria-pressed="false">${icon('eye')}</button></span></label>`:''}
  <p class="form-error" id="auth-message" role="status"></p><button class="button primary full-width" ${configured?'':'disabled'}>${t(registering?'register':reset?'resetPassword':newPassword?'save':'login')}</button></form>
  ${!newPassword?`<div class="auth-links"><button class="text-button" data-auth-mode="${registering?'login':'register'}">${t(registering?'login':'register')}</button><button class="text-button" data-auth-mode="reset">${t('forgot')}</button></div>`:''}`;
}
function emailNotice(message){
 $('#auth-dialog').innerHTML=`<div class="email-notice" role="status"><span class="notice-symbol">${icon('bookmark')}</span><h2>${t('emailSent')}</h2><p>${t(message)}</p><button class="button primary full-width" data-close="auth-dialog">${t('close')}</button></div>`;
}
function accountDialog(){
 const rows=accounts.list();
 $('#collection-dialog').className='small-dialog account-dialog';
 $('#collection-dialog').innerHTML=closeButton('collection-dialog')+`<h2>${t('switchAccount')}</h2><div class="account-options">${rows.map(a=>`<button class="account-option" data-account="${esc(a.id)}" ${a.id===user?.id?'disabled':''}><span class="account-initial">${esc((a.name||a.email||'?').slice(0,1).toUpperCase())}</span><span><strong>${esc(a.name||a.email)}</strong><small>${esc(a.email||'')}</small></span>${a.id===user?.id?`<span>${t('currentAccount')}</span>`:''}</button>`).join('')}</div><button class="button primary full-width" data-action="add-account">${icon('plus')} ${t('addAccount')}</button>`;
 $('#collection-dialog').showModal();
}
async function switchAccount(id){
 if(id===user?.id)return;
 recordProgress();await flush();
 const session=accounts.session(id);if(!session)return;
 const {error}=await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
 if(error){accounts.forget(id);$('#collection-dialog').close();authDialog();toast(t('accountExpired'));return;}
 $('#collection-dialog').close();
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
  const key=nicknameErrorKey(error)||authErrorKey(error);
  if(key)return t(key);
  return dictionaries[lang][error?.message] || t("requestError");
}
async function submitAuth(form) {
  if (authBusy || !configured) return;
  authBusy = true;
  const data = new FormData(form),
    button = form.querySelector('button:not([type="button"])');
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
      const name=await checkNickname(client,data.get("name"));
      result = await client.auth.signUp({
        email: String(data.get("email")),
        password: String(data.get("password")),
        options: {
          data: { name },
          emailRedirectTo: redirect,
        },
      });
      if(result.error&&/database error saving new user/i.test(result.error.message||'')) {
        try{await checkNickname(client,name);}catch(error){if(error.message==='nicknameTaken')throw error;}
      }
      if (!result.error && !result.data.session) {
        emailNotice("checkEmail");
        return;
      }
    } else if (authMode === "reset") {
      result = await client.auth.resetPasswordForEmail(
        String(data.get("email")),
        { redirectTo: redirect },
      );
      if (!result.error) {
        emailNotice("resetEmail");
        return;
      }
    } else if (authMode === "newPassword") {
      result = await client.auth.updateUser({
        password: String(data.get("password")),
      });
      if (!result.error) toast(t("passwordUpdated"));
    } else
      result = await signInIdentifier(client, String(data.get("email")), String(data.get("password")), window.YORU_CONFIG);
    if (result.error) throw result.error;
    $("#auth-dialog").close();
  } catch (error) {
    $("#auth-message").textContent = errorText(error);
  } finally {
    authBusy = false;
    const b = $('#auth-form button:not([type="button"])');
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
    if (user) {
      if(operations.length)localStorage.setItem(draftKey(), JSON.stringify(operations));
      else localStorage.removeItem(draftKey());
      sessionStorage.removeItem(draftKey());
    }
  } catch {}
}
function updateSync() {
  const el = $("#sync-state");
  if (el) {
    el.hidden = !syncFailure;
    el.textContent = syncFailure ? t('syncError') : '';
    el.classList.toggle("error", syncFailure);
  }
}
function accountAnimeSnapshot(a) {
  const {episodeManifest,episodeNumbers,goVoices,currentGoVoices,goVoiceOrdinal,description,...snapshot}=a;
  return {...snapshot,translations:Object.fromEntries(Object.entries(a.translations||{}).map(([language,value])=>[language,[value[0],'']]))};
}
function mutate(op) {
  if(!user){const next=applyGuestPlaybackOperation(state,op);if(next){
    state=next;
    try{localStorage.setItem('yooickuu.guest-player',JSON.stringify({...read('yooickuu.guest-player',{}),...op.patch}));}catch{}
    return true;
  }}
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
    op.patch = { ...op.patch, anime: accountAnimeSnapshot(byId(op.id)) };
  if (op.type === "progress" && (byId(op.value.id)?.providerId || byId(op.value.id)?.animeVostId || byId(op.value.id)?.kitsuId))
    op.value.anime = accountAnimeSnapshot(byId(op.value.id));
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
      if(user?.id === uid)syncFailure = true;
    } finally {
      syncBusy = false;
      flushing = null;
      updateSync();
      if(user?.id !== uid && user && ready && operations.length)queueMicrotask(flush);
    }
  })();
  return flushing;
}
const avatarLoader = createAvatarLoader({
  identity: () => ({uid:user?.id, path:state.preferences.avatar}),
  sign: async path => {
    const {data,error} = await client.storage.from('avatars').createSignedUrl(path,3600);
    if(error)throw error;
    return data?.signedUrl;
  },
  display: url => {
    avatarUrl = url;
    for(const node of $$('.avatar, .profile-avatar')) {
      if(url&&node.querySelector('img')?.getAttribute('src')===url)continue;
      node.innerHTML = url ? `<img src="${esc(url)}" alt="">` : esc((state.preferences.name || user?.email || 'u').slice(0,1).toUpperCase());
    }
  },
});
let bannerUrl='';
const bannerLoader=createAvatarLoader({
 identity:()=>({uid:user?.id,path:state.preferences.banner}),
 sign:async path=>{const {data,error}=await client.storage.from('avatars').createSignedUrl(path,3600);if(error)throw error;return data?.signedUrl;},
 display:url=>{bannerUrl=url;const img=$('#profile-banner-image');if(img){img.hidden=!url;if(url)img.src=url;else img.removeAttribute('src');}}
});
const avatarLoad = () => Promise.all([avatarLoader.refresh(),bannerLoader.refresh()]);
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
      pending = JSON.parse(localStorage.getItem(draftKey()) || sessionStorage.getItem(draftKey()) || "[]");
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
    if(state.collections.length || state.statuses.some(s=>s.id==='onhold'&&s.key==='onhold'))mutate({type:'unifyLists'});
    dataError = false;
    lang = dictionaries[state.preferences.language]
      ? state.preferences.language
      : lang;
    appearance = normalizeStyle(state.preferences.appearance);
    void avatarLoad().catch(()=>{});
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
async function handleSession(session, event) {
  try{accounts.remember(session);}catch{}
  const next = session?.user || null;
  authResolved=true;
  if (next?.id === user?.id) {
    if (event === "PASSWORD_RECOVERY") authDialog("newPassword");
    if(page==='watch'&&!current)fromHash();
    return;
  }
  if(current)stopWatching();
  ++sourceGeneration;

  unifiedProfileKey='';
  profileDraft.clear();
  avatarLoader.reset();bannerLoader.reset();
  socialModule?.clearCache?.(client);
  user = next;
  void startNotifications();
  state = next ? defaults() : normalize({preferences:read("yooickuu.guest-player", {})});
  operations = [];
  ready = false;
  dataError = false;
  avatarUrl = "";
  syncFailure = false;
  ++authGeneration;
  render();
  if (user) await loadProfile();
  if(page==='watch')await fromHash();
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

  }
}
function latestProgress(id) {
  if(!user)return null;
  return Object.values(state.progress)
    .filter((p) => p?.id === id)
    .sort((a, b) => b.updated - a.updated)[0];
}
function playerHTML() {
  const related=[...new Map([...playerSeasons,...onlineItems].filter(a=>a.id!==current.id&&!a.catalogOnly).map(a=>[a.id,a])).values()].slice(0,5);
  return watchView({a:current,t,title,cover,lang,speed:state.preferences.speed,preferencesHTML:preferencesHTML(),related});
}
async function openPlayer(id, requested, pushRoute=true) {
  if (playerOpening || (user && !ready)) return;
  playerOpening = true;
  const openingHash=location.hash, openingAccount=authGeneration;
  let a;
  try{[a]=await Promise.all([findWatchRelease(id),(async()=>{watchView ||= (await import(new URL(__WATCH_VIEW_ASSET__,document.baseURI).href)).watchView;})()]);}catch{toast(t("providerError"));}
  if(!a){playerOpening=false;toast(t('releaseAwaitingReview'));if(page==='watch'&&!current)navigate('catalog');return;}
  if(!requested){const first=(await releaseSeasons(a)).find(x=>['TV','ONA'].includes(x.type)&&x.episodeManifest?.some(e=>e.season>0));if(first){a=first;id=a.id;}}
  if (a.providerId || a.animeVostId || a.animeGoId || a.kitsuId || a.malId) {
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
  if ((a.providerId || a.animeVostId || a.animeGoId) && !a.episodes) {toast(t("noReleasedEpisodes"));playerOpening=false;return;}
  if ((user && !ready) || openingAccount!==authGeneration || location.hash!==openingHash) {playerOpening=false;return;}
  try {
    recordProgress();
    $$("dialog[open]").forEach((d) => d.close());
    controlsCleanup?.();controlsCleanup=null;
    playback?.destroy();
    playback = null;
    const previous=latestProgress(id);
    const requestedProgress=requested?state.progress[`${id}:${requested}`]:previous;
    const resumeIndex=requestedProgress&&a.episodeNumbers?savedEpisodeIndex(requestedProgress,a.episodeNumbers,a.episodeManifest):0;
    if(user&&a.episodeNumbers)mutate({type:'rebaseEpisodes',id:a.id,numbers:a.episodeNumbers,manifest:a.episodeManifest});
    current = a;
    page='watch';
    playerSeasons = knownSeasons(a);
    episode = Math.min(
      a.episodes,
      Math.max(1, requested ? (resumeIndex || requested) : firstMainEpisode(a)),
    );
    seasonGroup=seasonMenu(a,playerSeasons,episode).find(x=>x.selected)?.extra?'extras':'main';
    selectedAudio=preferredAudio(playerAudioChoices(a,episode),state.preferences,a.id);
    const hash=`#watch/${a.id}/${episode}`;
    if(pushRoute && location.hash!==hash)history.pushState(null,'',hash);else history.replaceState(null,'',hash);
    render(true);window.scrollTo({top:0,behavior:'instant'});
    attachVideo();
    renderEpisodes();
    const playerId = current.id;
    releaseSeasons(a).then(items=>{if(current?.id===playerId && (page==='watch' && !!$('#video'))){playerSeasons=items;renderEpisodes();}}).catch(()=>{});
    await updateSource(true);
  } finally {
    playerOpening = false;
  }
}
function renderEpisodes() {
  resetSocialComments();
  if (!current || !$("#episode-picker")) return;
  $("#episode-control").hidden = false;
  const seasonView=episodeSeasonOptions(current,episode);
  $("#episode-picker").innerHTML=seasonView.episodes.map(e=>`<option value="${e.index}" ${e.index===episode?'selected':''}>${t('episode')} ${esc(e.ordinal)}</option>`).join('');
  $("#season-control").hidden = false;
  const allSeasons=seasonMenu(current,playerSeasons,episode);
  let visibleSeasons=allSeasons.filter(item=>!!item.extra===(seasonGroup==='extras'));
  if(!visibleSeasons.length){seasonGroup=allSeasons[0]?.extra?'extras':'main';visibleSeasons=allSeasons;}
  $$('[data-season-group]').forEach(button=>{button.setAttribute('aria-selected',String(button.dataset.seasonGroup===seasonGroup));button.hidden=!allSeasons.some(item=>!!item.extra===(button.dataset.seasonGroup==='extras'));});
  $("#season-picker").innerHTML=visibleSeasons.map(item=>`<option value="${esc(item.value)}" ${item.selected?'selected':''}>${item.season===0?t('additionalEpisodes')+' · '+esc(title(item.title)):!item.displaySeason?(item.kind==='MOVIE'?t('movie'):esc(item.kind))+' · '+esc(title(item.title)):(lang==='ru'?item.displaySeason+' '+t('season'):t('season')+' '+item.displaySeason)+(item.part?' · '+t('seasonPart')+' '+item.part:'')}</option>`).join('');
  $('#watch-episode-label').textContent=current.episodes===1&&current.type==='MOVIE'?t('movie'):t('episode')+' '+(current.episodeManifest?.[episode-1]?.ordinal??current.episodeNumbers?.[episode-1]??episode);
  const audio=playerAudioChoices(current,episode);
  if(!selectedAudio)selectedAudio=preferredAudio(audio,state.preferences,current.id);
  $('#audio-control').hidden=!audio.length;
  $('#audio-picker').innerHTML=(selectedAudio&&!audio.some(x=>x.id===selectedAudio)?`<option value="${esc(selectedAudio)}" selected disabled>${t('audioUnavailable')}</option>`:'')+audio.map(x=>`<option value="${esc(x.id)}" ${x.id===selectedAudio?'selected':''}>${esc(x.label)}${x.onDemand?'':' · '+t(x.language==='ja'?'audioJapanese':x.language==='en'?'audioEnglish':x.language==='ru'?'audioRussian':'audioOther')}</option>`).join('');
  const navigation=seasonNavigation(current,episode);
  $("#previous-episode").hidden=!navigation.previous;
  $("#next-episode").hidden=!navigation.next;
  enhanceSelects($("#watch-page"));
}
let recordReady = false;
async function updateSource(play = false, refresh = false, position, triedAudio = new Set()) {
  const generation = ++sourceGeneration;
  sourceKey = null;
  recordReady = false;
  providerTiming = null;
  const video = $("#video");
  if (!video || !current) return;
  playback?.suspend();
  englishSubtitlesCleanup?.();englishSubtitlesCleanup=null;
  $('#source-empty [data-consumet-return]')?.remove();
  $('#source-empty h3').textContent=t('videoError');
  playback ||= createPlayback(video);
  const english=externalAudio(selectedAudio);
  if(english)video.pause();
  const englishFailure=()=>{
    const russian=audioChoices(current,episode).find(track=>track.language==='ru');
    const show=module=>{if(generation!==sourceGeneration)return;module.showFailure({container:$('#source-empty'),status:$('#source-status'),lang,onRussian:russian?()=>{selectedAudio=russian.id;renderEpisodes();mutate({type:'preferences',patch:{audio:russian.id,audioByAnime:{...state.preferences.audioByAnime,[current.id]:russian.id}}});void updateSource(true);}:null});};
    loadConsumet().then(show).catch(()=>{});
  };
  const onMetadata=()=>{
    if(generation!==sourceGeneration)return;
    if(current?.catalogApproved)providerTiming={...providerTiming,...approvedSkipTimes(providerTiming,video.duration)};
    recordReady=true;
    loadAutomaticSkips();
  };
  triedAudio.add(selectedAudio);
  const tryOtherAudio=()=>{
    if(english)return false;
    const next=audioChoices(current,episode).find(t=>!triedAudio.has(t.id));
    if(!next)return false;
    selectedAudio=next.id;renderEpisodes();
    toast(t('audioAutoFallback')+' '+next.label);
    void updateSource(play,false,video.currentTime||position,triedAudio);return true;
  };
  let availableSources=[],attemptedURLs=new Set(),nextPrepared=false;
  const onStatus = status=>{
    if(generation!==sourceGeneration || page!=='watch' || !$('#video'))return;
    if(status==='playing'&&!nextPrepared&&state.preferences.autoNext&&episode<current.episodes){
      nextPrepared=true;
      const upcoming={...current},nextIndex=episode+1,preferred=selectedAudio;
      // Resolve only next-episode metadata, never download the next video in the background.
      (async()=>{await prepareEpisodeAudio(upcoming,nextIndex);
        const choices=audioChoices(upcoming,nextIndex);
        const audio=choices.find(x=>x.id===preferred)?.id||preferredAudio(choices,state.preferences,upcoming.id);
        // Prefetch only the stored manifest; no resolver request before playback.
      })().catch(()=>{});
    }
    const loading=$(".video-loading");
    if(loading)loading.hidden=!['loading','buffering'].includes(status);
    if(['error','unsupported'].includes(status)){
      if(status==='error'&&!refresh&&providerTiming?.providerRef?.provider==='kodik'){
        void updateSource(play,true,video.currentTime||position,triedAudio);return;
      }
      const fallback=availableSources.find(s=>!attemptedURLs.has(s.url));
      if(fallback){
        attemptedURLs.add(fallback.url);
        $('#quality').value=String(fallback.quality);enhanceSelects($('#watch-page'));
        const saved=state.progress[sourceKey];
        recordReady=false;
        playback.load({url:fallback.url,stream:fallback.stream??fallback.url.includes('.m3u8'),autoplay:play,startAt:video.currentTime||resumeTime(saved,!!user,position),speed:Number(state.preferences.speed)||1,onState:onStatus,onMetadata});return;
      }
      if(tryOtherAudio())return;
      $("#source-empty").hidden=false;
      $("#source-status").textContent=t(status==='unsupported'?'videoUnsupported':'videoError');
      if(english)englishFailure();
    }else if(status==='autoplayBlocked'){
      if(loading)loading.hidden=true;
    }else if(['ready','playing'].includes(status)){
      $("#source-empty").hidden=true;
      $("#source-status").textContent=current.id==='sintel'?'Sintel · Blender Foundation · CC BY 3.0':'';
    }
  };
  sourceKey = `${current.id}:${episode}`;

  $("#player-title").textContent=title(current);
  $("#source-status").textContent='';
  $("#source-empty").hidden=true;
  $(".video-loading").hidden=false;
  $("#quality-control").hidden=true;
  renderEpisodes();
  let url=null,stream=false;
  try {
    if(!english&&current.animeGoId){const loadingAnime=current;await prepareEpisodeAudio(loadingAnime,episode).catch(()=>{loadingAnime.currentGoVoices=[];loadingAnime.goVoiceOrdinal=null;});if(generation!==sourceGeneration)return;selectedAudio=preferredAudio(audioChoices(current,episode),state.preferences,current.id);renderEpisodes();}
    if(!isPublished(current.id))throw Error('noSource');
    else if(current.catalogApproved){
      const loadingAnime=current,loadingEpisode=episode,loadingAudio=selectedAudio;
      const info=english
        ? await (await loadConsumet()).videoEpisode(loadingAnime,loadingEpisode,loadingAudio,{refresh,current:()=>generation===sourceGeneration})
        : await retrySourceRequest(()=>videoEpisode(loadingAnime,loadingEpisode,refresh,loadingAudio),{current:()=>generation===sourceGeneration});
      if(generation!==sourceGeneration)return;
      providerTiming=info;
      if(english)englishSubtitlesCleanup=consumetModule.attachSubtitles(video,info.subtitleText);
      availableSources=info?.sources||[];
      const selected=chooseQuality(info?.sources||[],state.preferences.quality);
      url=selected?.url;stream=selected?.stream??(info?.stream??url?.includes('.m3u8'));
      enhanceSelects($('#watch-page'));
      if(info?.sources?.length){
        $("#quality-control").hidden=false;
        $("#quality").innerHTML=info.sources.map(q=>`<option value="${q.quality}" ${q.quality===selected?.quality?'selected':''}>${q.quality?`${q.quality}p`:'Auto'}</option>`).join('');
        enhanceSelects($("#watch-page"));
      }
    }else throw Error('notAdmitted');
    if(generation!==sourceGeneration)return;
    if(!url)throw Error('noSource');
    const saved=state.progress[sourceKey];
    attemptedURLs.add(url);
    playback.load({url,stream:stream||url.includes('.m3u8'),autoplay:play,startAt:resumeTime(saved,!!user,position),speed:Number(state.preferences.speed)||1,onState:onStatus,onMetadata});
  }catch(error){
    if(generation!==sourceGeneration)return;
    if(english)englishFailure();
    // Do not repeat a server outage for every dub; only a missing track warrants that.
    if(error.message==='audioUnavailable'&&tryOtherAudio())return;
    $(".video-loading").hidden=true;
    $("#source-empty").hidden=false;
    $("#source-status").textContent=t(error.message==='providerBlocked'?'providerBlocked':error.message==='noSource'?'noSource':'videoError');
  }
}
function saveSoundPreferences(){
  const video=$('#video');if(!video||(user&&!ready))return;
  const patch=soundPreferences(video),saved=soundPreferences(state.preferences);
  if(patch.volume!==saved.volume||patch.muted!==saved.muted)mutate({type:'preferences',patch});
}
function recordProgress() {
  saveSoundPreferences();
  const video = $("#video");
  if (
    !user || !ready ||
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
    season: current.episodeManifest?.[episode-1]?.season??1,
    ordinal: current.episodeManifest?.[episode-1]?.ordinal??current.episodeNumbers?.[episode-1]??episode,
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
  if (!current || !Number.isInteger(n) || n < 1 || n > current.episodes || n === episode) return;
  recordProgress();
  episode = n;
  history.replaceState(null,'',`#watch/${current.id}/${episode}`);
  await updateSource(play);
}
function attachVideo() {
  const video = $("#video");
  controlsCleanup?.();
  controlsCleanup=attachControls($(".video-shell"), video, t, () => toast(t("playerActionError")), {sound:soundPreferences(state.preferences),onSoundChange:saveSoundPreferences});
  automationCleanup?.();
  automationCleanup=attachPlaybackAutomation(video,{
    context:()=>({ready:recordReady&&!!current&&page==='watch',token:sourceGeneration,
      timing:providerTiming,preferences:state.preferences,episode,total:current?.episodes,
      hasNext:!!current&&isPublished(current.id)&&!!seasonNavigation(current,episode).next}),
    onSkip:kind=>{if(kind==='opening')toast(t('introSkipped'));},
    onTick:()=>{if(Date.now()-lastProgress>5000){recordProgress();lastProgress=Date.now();}},
    onEnded:next=>{
    recordProgress();
    renderEpisodes();
    if (next) switchEpisode(seasonNavigation(current,episode).next, next.play);
    }
  });
  video.addEventListener("pause", recordProgress);
}
function stopWatching(){
  ++socialCommentVersion;socialCommentKey='';socialCommentObserver?.disconnect();socialCommentCleanup?.();socialCommentCleanup=null;
  recordProgress();controlsCleanup?.();controlsCleanup=null;automationCleanup?.();automationCleanup=null;sourceKey=null;recordReady=false;++sourceGeneration;
  englishSubtitlesCleanup?.();englishSubtitlesCleanup=null;
  playback?.destroy();playback=null;current=null;closeSelectMenu();
}
async function loadAutomaticSkips(){
  const video=$('#video'),own=sourceGeneration,key=sourceKey;
  if(!video||!current)return;
  const notice=$('#skip-availability');
  if(!state.preferences.autoSkip){if(notice)notice.textContent='';return;}
  if(notice)notice.textContent=t('skipLoading');
  const fallback=!current.catalogApproved&&(!providerTiming?.opening||!providerTiming?.ending)?await automaticSkipTimes(current.malId,Number(current.episodeManifest?.[episode-1]?.ordinal??current.episodeNumbers?.[episode-1]??episode),video.duration):{};
  if(own!==sourceGeneration||key!==sourceKey)return;
  providerTiming={...providerTiming,opening:providerTiming?.opening||fallback.opening,ending:providerTiming?.ending||fallback.ending};
  if(notice)notice.textContent=providerTiming.opening||providerTiming.ending?'':t('skipUnavailable');
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
  try {
    const {error}=await client.storage.from('avatars').upload(path,cropped,{contentType:'image/png',upsert:false});
    if(error)throw error;
    if (user?.id !== uid) return;
    mutate({ type: "preferences", patch: { avatar: path } });
    void avatarLoad().catch(()=>{});
    if(user?.id===uid)render();
  } catch { if(user?.id===uid)toast(t('requestError')); }
}
async function uploadBanner(file){
 if(!requireUser()||!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20971520){toast(t('avatarInputError'));return;}
 const uid=user.id;let blob;
 try{blob=await cropBanner(file,t);}catch{toast(t('avatarInputError'));return;}
 if(!blob||user?.id!==uid)return;
 if(blob.size>2097152){toast(t('avatarError'));return;}
 const path=`${uid}/banner-${crypto.randomUUID()}.jpg`;
 try{
  const {error}=await client.storage.from('avatars').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(error)throw error;
  if(user?.id!==uid)return;
  mutate({type:'preferences',patch:{banner:path}});
  await bannerLoader.refresh();if(user?.id===uid)render();
 }catch{if(user?.id===uid)toast(t('requestError'));}
}
let deletionBusy=false;
function deleteAccountDialog(){
  if(!requireUser())return;
  const dialog=$('#collection-dialog');dialog.className='small-dialog';
  dialog.innerHTML=closeButton('collection-dialog')+`<h2>${t('deleteAccount')}</h2><p class="account-delete-copy">${t('deleteAccountCopy')}</p><form id="delete-account-form"><label class="delete-confirm"><input type="checkbox" name="confirm" required><span>${t('deleteAccountConfirm')}</span></label><p class="form-error" role="alert" id="delete-account-error"></p><div class="form-actions"><button type="button" class="button soft" data-close="collection-dialog">${t('cancel')}</button><button class="button danger">${t('deleteAccount')}</button></div></form>`;
  dialog.showModal();
}
async function submitAccountDeletion(form){
  if(deletionBusy||!requireUser()||!form.elements.confirm.checked)return;
  deletionBusy=true;
  const uid=user.id,button=form.querySelector('button:not([type="button"])');
  button.disabled=true;button.textContent=t('deletingAccount');
  try{
    stopWatching();await flush();
    if(user?.id!==uid)throw Error('deleteAccountFailed');
    const {data,error}=await client.functions.invoke('delete-account',{body:{confirm:true,expectedUserId:uid}});
    if(error||!data?.deleted){
      const status=error?.context?.status;
      throw Error([404,503].includes(status)?'deleteAccountUnavailable':'deleteAccountFailed');
    }
    try{sessionStorage.removeItem('yooickuu.pending.'+uid);localStorage.removeItem('yooickuu.pending.'+uid);}catch{}
    operations=[];profileDraft.clear();avatarLoader.reset();bannerLoader.reset();
    accounts.forget(uid);
    await client.auth.signOut({scope:'local'});
    await handleSession(null,'SIGNED_OUT');
    $('#collection-dialog').close();navigate('home');
  }catch(error){
    const message=$('#delete-account-error');
    if(message)message.textContent=t(error.message==='deleteAccountUnavailable'?'deleteAccountUnavailable':'deleteAccountFailed');
  }finally{deletionBusy=false;button.disabled=false;button.textContent=t('deleteAccount');}
}
function showAbout() {
  $("#about-dialog").className = "about-dialog";
  $("#about-dialog").innerHTML =
    closeButton("about-dialog") +
    `<span class="overline">yomiku</span><h2>${t("about")}</h2><p>${t("aboutCopy")}</p><p>${t("sources")}<br>${t("catalogRebuilding")}</p><button class="button primary" data-close="about-dialog">${t("close")}</button>`;
  $("#about-dialog").showModal();
}
async function selectSeason(value){
 if(value.startsWith('release:')){const [,id,season]=value.split(':');const a=playerSeasons.find(a=>a.id===id)||byId(id);const i=a?.episodeManifest?.findIndex(e=>(e.season??1)===Number(season));if(a&&i>=0)await openPlayer(id,i+1);}
 else if(value.startsWith('season:')){const season=Number(value.slice(7)),i=current.episodeManifest.findIndex(e=>(e.season??1)===season);if(i>=0)await switchEpisode(i+1,!!state.preferences.autoPlay);}
}
document.addEventListener("click", async (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  try {
    if(b.dataset.seasonGroup){
      seasonGroup=b.dataset.seasonGroup;
      const entries=seasonMenu(current,playerSeasons,episode).filter(item=>!!item.extra===(seasonGroup==='extras'));
      if(entries.length&&!entries.some(e=>e.selected))await selectSeason(entries[0].value);
      renderEpisodes();return;
    }
    if(b.dataset.styleChoice){
      const next=normalizeStyle(b.dataset.styleChoice);
      if(!mutate({type:'preferences',patch:{appearance:next,theme:'dark'}}))return;
      appearance=next;applyAppearance();
      $$('[data-style-choice]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.styleChoice===next)));
      return;
    }
    if(b.dataset.planMode){eveningMode=['all','continue','new'].includes(b.dataset.planMode)?b.dataset.planMode:'all';$('#evening-plan').outerHTML=eveningHTML();$('#evening-plan [data-plan-mode="'+eveningMode+'"]').focus({preventScroll:true});return;}
    if(b.dataset.planMinutes){eveningMinutes=Number(b.dataset.planMinutes);$('#evening-plan').outerHTML=eveningHTML();$('#evening-plan [data-plan-minutes="'+eveningMinutes+'"]').focus({preventScroll:true});return;}
    if(b.dataset.account){b.disabled=true;try{await switchAccount(b.dataset.account);}finally{b.disabled=false;}return;}
    if (b.dataset.close) $("#" + b.dataset.close).close();
    if(b.dataset.discover){catalogueView=b.dataset.discover;const preset=discoveryOptions(catalogueView);catalogScope='all';query='';genre='all';typeFilter=preset.type||'all';yearFilter='all';ratingFilter=String(preset.minRating||0);ongoingOnly=!!preset.ongoing;sort=preset.sort;navigate('catalog');}
    if (b.dataset.nav) navigate(b.dataset.nav);
    if (b.dataset.list) navigate("library", b.dataset.list);
    if (b.dataset.details) {b.disabled=true;try{await openDetails(b.dataset.details);}finally{b.disabled=false;}}
    if(b.dataset.libraryPage){libraryPageNumber=Number(b.dataset.libraryPage);renderGrid();$("#catalog")?.scrollIntoView({behavior:"smooth"});return;}
    if (b.dataset.catalogPage) {await loadCatalogue(false,Number(b.dataset.catalogPage));$("#catalog")?.scrollIntoView({behavior:"smooth"});}
    if (b.dataset.watch)
      await interfacePending(b,()=>openPlayer(b.dataset.watch, Number(b.dataset.episode) || undefined));
    if (b.dataset.selectEpisode)
      await interfacePending(b,()=>switchEpisode(Number(b.dataset.selectEpisode)));
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
      case "social-comments": await openSocialComments(); break;
      case "history-visibility":
        if(requireUser()){b.disabled=true;try{const previous=!!state.preferences.historyPublic;if(mutate({type:'preferences',patch:{historyPublic:!previous}})){await flush();if(operations.length)throw Error('syncError');render();}}catch{toast(t('requestError'));}finally{b.disabled=false;}}break;
      case "login":
        authDialog();
        break;
      case "register":
        authDialog("register");
        break;
      case "switch-account": accountDialog();break;
      case "add-account": $("#collection-dialog").close();authDialog();break;
      case "logout":
        recordProgress();
        await flush();
        {const id=user?.id;const {error}=await client.auth.signOut({scope:"local"});if(error)throw error;if(id)accounts.forget(id);}
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
      case 'toggle-password': {
        const input=b.parentElement.querySelector('input');
        const show=input.type==='password';input.type=show?'text':'password';
        b.setAttribute('aria-pressed',String(show));b.setAttribute('aria-label',t(show?'hidePassword':'showPassword'));
        b.innerHTML=icon(show?'eyeOff':'eye');break;
      }
      case 'delete-account':deleteAccountDialog();break;
      case "random":
        {
          if(randomBusy)break;randomBusy=true;b.disabled=true;
          try{
            const pool=await discoveryIndex();let found=null;
            for(let attempt=0;attempt<5;attempt++){
              const candidate=discoveryChoice(pool,state.entries,randomHistory);
              if(!candidate)break;randomHistory=[...randomHistory.slice(-19),candidate.id];
              try{const a=await resolveRelease(candidate);if(!a.blocked&&!a.catalogOnly&&a.episodes>0){found=a;break;}}catch{}
            }
            if(found)await openDetails(found.id);else toast(t('randomUnavailable'));
          }finally{randomBusy=false;b.disabled=false;}
        }
        break;
      case 'hero-previous':rotateHero(-1);break;
      case 'hero-next':rotateHero(1);break;
      case "about":
        showAbout();
        break;
      case "reload-library": libraryKey="";renderGrid();break;
      case "load-more":
        loadCatalogue(true);
        break;
      case "reload-catalog":
        loadCatalogue();
        break;
      case "reset":
        query = "";
        genre = "all";
        typeFilter = "all"; yearFilter = "all"; ratingFilter = "0";
        ongoingOnly = false;
        catalogueView = "all";
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
        mutate({type:'entry',id:detailId,patch:{notes:$('#detail-notes').value}});
        break;
      case "cinema":
        $("#watch-page").classList.toggle("cinema");
        b.setAttribute('aria-pressed',String($("#watch-page").classList.contains('cinema')));
        break;
      case "retry-video":
        recordProgress();
        await updateSource(true,true);
        break;
      case "previous":
        await switchEpisode(seasonNavigation(current,episode).previous, !!state.preferences.autoPlay);
        break;
      case "next":
        await switchEpisode(seasonNavigation(current,episode).next, !!state.preferences.autoPlay);
        break;
      case "banner": $('#banner-file')?.click();break;
      case "remove-banner": if(requireUser()){mutate({type:'preferences',patch:{banner:''}});bannerLoader.reset();render();}break;
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
          a.download = "yomiku-lists.json";
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
    if(event.isComposing)return;
    const caret=[event.target.selectionStart,event.target.selectionEnd];
    if (event.target.id === "search" && page !== "catalog") {
      if(current)stopWatching();
      page = "catalog";
      history.pushState(null,'','#catalog');
      render();
      const input = $("#search");
      input.focus();
      input.setSelectionRange(caret[0]??query.length,caret[1]??query.length);
    }
    for(const input of $$("#search,#catalog-search"))if(input!==event.target && input.value!==query)input.value=query;
    showSearchSuggestions(event.target.id);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadCatalogue(), 180);
  }
});
document.addEventListener("change", (event) => {
  const input = event.target;
  if(input.id==='genre-filter'){genre=input.value;if(page==='library')renderGrid();else loadCatalogue();}
  if(input.id==='catalog-view'){catalogueView=input.value;loadCatalogue();}
  if(input.id==='year-filter'){yearFilter=input.value;loadCatalogue();}
  if(input.id==='rating-filter'){ratingFilter=input.value;loadCatalogue();}
  if (input.id === "language") {
    lang = input.value;
    if (user && ready)
      mutate({ type: "preferences", patch: { language: lang } });
    if(page==='watch'&&current){const playing=!$('#video').paused;recordProgress();playback?.destroy();render(true);attachVideo();renderEpisodes();updateSource(playing);}else render();
    if($('#details').open&&detailId)openDetails(detailId);
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
  if(input.dataset.preference==='autoSkip')loadAutomaticSkips();
  if(input.id==='audio-picker'){
    const playing=!$('#video').paused;recordProgress();selectedAudio=input.value;
    mutate({type:'preferences',patch:{audio:selectedAudio,audioByAnime:{...state.preferences.audioByAnime,[current.id]:selectedAudio}}});updateSource(playing,false,$('#video').currentTime);
  }
  if (input.id === "episode-picker") switchEpisode(Number(input.value),!!state.preferences.autoPlay);
  if(input.id==='season-picker')void selectSeason(input.value);
  if (input.id === "quality") {
    const v=$("#video"),play=!!v && !v.paused;
    recordProgress();
    if(mutate({type:'preferences',patch:{quality:Number(input.value)}}))updateSource(play,false,v?.currentTime);
  }
  if (input.id === "speed") {
    const speed = Number(input.value);
    if ($("#video")) $("#video").playbackRate = speed;
    mutate({ type: "preferences", patch: { speed } });
  }

  if(input.id === "banner-file"){const file=input.files[0];input.value="";void uploadBanner(file);}
  if (input.id === "avatar-file") { const file=input.files[0];input.value="";uploadAvatar(file); }
});
for (const eventName of ['input','change']) document.addEventListener(eventName, event => {
  const input=event.target;
  if(user && input.closest('#profile-form') && input.name)profileDraft.set(user.id,input.name,input.value);
});
const nicknameFeedback=nicknameChecker(value=>checkNickname(client,value),(input,key)=>{
  const message=input.form?.querySelector('[data-nickname-message]');
  if(message)message.textContent=key?t(key):'';
  input.setAttribute('aria-invalid',key==='nicknameTaken'?'true':'false');
});
document.addEventListener('input',event=>{
  const input=event.target;
  if(configured&&input.name==='name'&&['auth-form','profile-form'].includes(input.form?.id))nicknameFeedback.schedule(input);
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target,
    data = new FormData(form);
  if (form.id === "catalog-page-form") {const n=Number(data.get("page"));if(Number.isInteger(n)&&n>=1&&n<=catalogPages){loadCatalogue(false,n);$("#catalog")?.scrollIntoView({behavior:"smooth"});}return;}
  if(form.id==='delete-account-form'){await submitAccountDeletion(form);return;}
  if (form.id === "auth-form") submitAuth(form);
  if (form.id === "collection-form") submitCollection(form);
  if (form.id === "profile-form") {
    const patch = {
      name: String(data.get("name")).trim(),
      bio: String(data.get("bio")).trim(),
      language: lang,
      theme: "dark",
      appearance,
    };
    if (!patch.name) {toast(t('invalidName')); return;}
    const uid=user?.id, button=form.querySelector('button:not([type="button"])');
    button.disabled=true;
    try {
      patch.name=await checkNickname(client,patch.name);
      await flush();
      if(user?.id!==uid)return;
      if(operations.length)throw Error('syncError');
      const next=await saveOperation(uid,{type:'preferences',patch});
      if(user?.id!==uid)return;
      state=operations.reduce((s,o)=>applyOperation(s,o),next);
      profileDraft.clear();persistDraft();render();
    }catch(error){
      if(user?.id===uid){const message=form.querySelector('[data-nickname-message]');if(message)message.textContent=errorText(error);}
    }finally{button.disabled=false;}
  }

});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (!$$("dialog").some((d) => d.open)) $("#search")?.focus();
    return;
  }
  if(page!=='watch'||document.querySelector('dialog[open]'))return;
  const action=playerShortcut(event),v=$('#video');
  if(!action||!v)return;
  event.preventDefault();
  const selector={fullscreen:'[data-video="fullscreen"]',mute:'[data-video="mute"]',cinema:'[data-action="cinema"]',play:'[data-video="play"]'}[action];
  if(selector){$(selector)?.click();return;}
  if(Number.isFinite(v.duration))v.currentTime=Math.min(v.duration,Math.max(0,v.currentTime+(action==='back'?-10:10)));

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
window.addEventListener("online", () => {flush();avatarLoad();});
document.addEventListener("visibilitychange", () => {if(!document.hidden)avatarLoad();});
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
  if (page === "watch" || page === "library" || page === "profile") return;
  const generation = ++catalogGeneration;
  catalogBusy = true;
  catalogError = false;
  if (!more) {
    onlineItems = [];
  }
  renderGrid();
  try {
    const result = await combinedCatalogue(page==='home'?{scope:'watchable',view:'popular',sort:'picked',query:'',genre:'all',type:'all',page:1}:{
      scope: catalogScope,
      view: catalogueView,
      query,
      page: more ? catalogPage + 1 : targetPage,
      genre,
      sort,
      type: typeFilter,
      ongoing: ongoingOnly, year: yearFilter, minRating: Number(ratingFilter),
    });
    if (generation !== catalogGeneration) return;
    onlineItems = more ? [...new Map([...onlineItems, ...result.items].map(a=>[a.id,a])).values()].slice(-120) : result.items;
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
      if(query&&['search','catalog-search'].includes(document.activeElement?.id))showSearchSuggestions(document.activeElement.id,onlineItems);
    }
  }
}

document.addEventListener("error", event => {
  const img=event.target;
  if(img.tagName!=="IMG")return;
  if(img.dataset.artFill){img.hidden=true;return;}
  if(img.dataset.detailsArt){
    const a=byId(img.dataset.detailsArt);
    if(a&&!a.catalogApproved&&!img.dataset.artFallback){img.dataset.artFallback='true';img.dataset.poster=a.id;img.src=cover(a);img.closest('.details-artwork')?.classList.add('portrait-art');}
    return;
  }
  if(!img.dataset.poster)return;
  const a=byId(img.dataset.poster);
  if(a?.posterFallback && img.src!==a.posterFallback && !img.dataset.retried){img.dataset.retried="true";img.src=a.posterFallback;}
},true);

window.addEventListener('yoru:posters-ready',()=>{
 for(const img of document.querySelectorAll('img[data-poster]')){const a=byId(img.dataset.poster);if(a?.image&&img.getAttribute('src')!==cover(a)){delete img.dataset.qualityChecked;img.src=cover(a);}}
});

window.addEventListener('yoru:source-ready',()=>{combinedCatalogue.clear();resolveRelease.clear();if(['home','catalog'].includes(page))loadCatalogue();});

window.addEventListener('scroll',()=>document.querySelector('.header')?.classList.toggle('scrolled',window.scrollY>40),{passive:true});

document.addEventListener('load',event=>{const img=event.target;if(!(img instanceof HTMLImageElement))return;if(img.id==='profile-banner-image'){img.parentElement?.classList.toggle('portrait-banner',img.naturalHeight>img.naturalWidth);const fill=img.parentElement?.querySelector('.profile-banner-fill');if(fill){fill.src=img.currentSrc;fill.hidden=false;}}if(img.dataset.detailsArt){const fill=img.closest('.details-artwork')?.querySelector('.details-art-fill');if(fill){fill.hidden=false;if(fill.getAttribute('src')!==img.getAttribute('src'))fill.src=img.getAttribute('src');}}if(img.dataset.detailsArt&&img.naturalWidth<img.naturalHeight){img.closest('.details-artwork')?.classList.add('portrait-art');void improvePoster(img,byId(img.dataset.detailsArt));}else if(img.dataset.poster)void improvePoster(img,byId(img.dataset.poster));},true);

function closeSearchSuggestions(){
 document.querySelectorAll('.search-suggestions').forEach(n=>n.remove());
 document.querySelectorAll('#search,#catalog-search').forEach(n=>{n.setAttribute('aria-expanded','false');n.removeAttribute('aria-activedescendant');});
}
function showSearchSuggestions(id, pool=publishedItems){
 closeSearchSuggestions();const input=document.getElementById(id);if(!input)return;
 const items=suggestions(pool,query);if(!items.length)return;
 const panel=document.createElement('div');panel.id='search-suggestions';panel.className='search-suggestions';panel.setAttribute('role','listbox');
 panel.innerHTML=items.map((a,i)=>`<button type="button" role="option" id="suggestion-${i}" aria-selected="false" data-details="${esc(a.id)}"><img src="${esc(cover(a))}" alt=""><span><strong>${esc(title(a))}</strong><small>${a.year||''} · ${esc(a.type||'')}</small></span></button>`).join('');
 input.parentElement.append(panel);input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',panel.id);input.setAttribute('aria-expanded','true');
}
document.addEventListener('keydown',event=>{
 const panel=document.querySelector('.search-suggestions');if(!panel||!['search','catalog-search'].includes(event.target.id))return;
 const options=[...panel.querySelectorAll('[role="option"]')],old=options.findIndex(o=>o.getAttribute('aria-selected')==='true');
 if(['ArrowDown','ArrowUp'].includes(event.key)){
  event.preventDefault();const index=event.key==='ArrowDown'?(old+1)%options.length:(old<=0?options.length-1:old-1);
  options.forEach((o,i)=>o.setAttribute('aria-selected',String(i===index)));event.target.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});
 }else if(event.key==='Enter'&&old>=0){event.preventDefault();options[old].click();closeSearchSuggestions();}
 else if(event.key==='Escape')closeSearchSuggestions();
});
document.addEventListener('click',event=>{if(event.target.closest('.search-suggestions button')||!event.target.closest('.search,.catalog-search'))closeSearchSuggestions();});
document.addEventListener('focusin',event=>{if(!event.target.closest('.search,.catalog-search'))closeSearchSuggestions();});

// Warm only optional social code on user intent, without fetching account data.
const socialWarm=new Set();
function warmSocial(event){const element=event.target.closest?.('[data-nav="profile"],a[href^="#user/"],a[href^="#social/chats"]');if(!element||navigator.connection?.saveData)return;const kind=element.matches('[data-nav="profile"],a[href^="#user/"]')?'profile':'chats';if(socialWarm.has(kind))return;socialWarm.add(kind);loadSocial().then(m=>m.prefetch(kind)).catch(()=>socialWarm.delete(kind));}
document.addEventListener('pointerover',warmSocial,{passive:true});document.addEventListener('focusin',warmSocial);document.addEventListener('touchstart',warmSocial,{passive:true});
async function interfacePending(element,action){const notice=document.createElement('span');notice.className='ui-pending';notice.role='status';notice.textContent=t('loading');element.setAttribute('aria-busy','true');element.classList.add('ui-busy');element.append(notice);try{await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));return await action();}finally{notice.remove();element.removeAttribute('aria-busy');element.classList.remove('ui-busy');}}
