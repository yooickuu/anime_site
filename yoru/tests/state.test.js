import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  applyOperation,
  skipTarget,
  nextEpisodeAction,
  normalize,
} from "../src/state.js";
import { dictionaries } from "../src/i18n.js";
import {
  normalizeRelease,
  safeMediaURL,
  fetchCatalogue,
  providerEpisode,
} from "../src/provider.js";
test("custom statuses can be created, assigned, renamed, and removed without losing anime", () => {
  let s = defaults();
  s = applyOperation(s, {
    type: "createStatus",
    id: "custom",
    name: "Смотрим с друзьями",
  });
  s = applyOperation(s, {
    type: "entry",
    id: "a",
    patch: { status: "custom", rating: 9 },
  });
  s = applyOperation(s, {
    type: "renameStatus",
    id: "custom",
    name: "Наш марафон",
  });
  assert.equal(s.statuses.find((s) => s.id === "custom").name, "Наш марафон");
  s = applyOperation(s, { type: "deleteStatus", id: "custom" });
  assert.equal(s.entries.a.status, null);
  assert.equal(s.entries.a.rating, 9);
  assert.equal(
    s.statuses.some((s) => s.id === "custom"),
    false,
  );
});
test("standard statuses are removable", () => {
  let s = defaults();
  s = applyOperation(s, {
    type: "entry",
    id: "a",
    patch: { status: "watching" },
  });
  s = applyOperation(s, { type: "deleteStatus", id: "watching" });
  assert.equal(s.entries.a.status, null);
  assert.equal(
    s.statuses.some((s) => s.id === "watching"),
    false,
  );
});
test("all statuses may be removed; adding an anime still works", () => {
  let s = defaults();
  for (const v of [...s.statuses])
    s = applyOperation(s, { type: "deleteStatus", id: v.id });
  s = applyOperation(s, { type: "entry", id: "a", patch: { notes: "hello" } });
  assert.equal(s.entries.a.status, null);
});
test("one anime may belong to multiple custom pages; deleting a page keeps history", () => {
  let s = defaults();
  for (const id of ["a", "b"])
    s = applyOperation(s, { type: "createCollection", id, name: id });
  for (const collectionId of ["a", "b"])
    s = applyOperation(s, {
      type: "collectionItem",
      collectionId,
      id: "frieren",
      add: true,
    });
  s = applyOperation(s, {
    type: "progress",
    key: "frieren:1",
    value: { time: 100 },
  });
  s = applyOperation(s, { type: "deleteCollection", id: "a" });
  assert.deepEqual(s.collections[0].items, ["frieren"]);
  assert.equal(s.progress["frieren:1"].time, 100);
  assert.ok(s.entries.frieren);
});
test("duplicate collection names and empty names are rejected", () => {
  const s = applyOperation(defaults(), {
    type: "createCollection",
    id: "a",
    name: "Weekend",
  });
  assert.throws(
    () =>
      applyOperation(s, {
        type: "createCollection",
        id: "b",
        name: " weekend ",
      }),
    /duplicateName/,
  );
  assert.throws(
    () => applyOperation(s, { type: "createCollection", id: "b", name: " " }),
    /invalidName/,
  );
});
test("operations never mutate previously loaded account state", () => {
  const s = defaults();
  const next = applyOperation(s, {
    type: "entry",
    id: "a",
    patch: { favorite: true },
  });
  assert.deepEqual(s.entries, {});
  assert.ok(next.entries.a.favorite);
});
test("removing anime cleans collection references but preserves progress", () => {
  let s = applyOperation(defaults(), {
    type: "createCollection",
    id: "c",
    name: "test",
  });
  s = applyOperation(s, {
    type: "collectionItem",
    collectionId: "c",
    id: "a",
    add: true,
  });
  s = applyOperation(s, { type: "progress", key: "a:1", value: { time: 20 } });
  s = applyOperation(s, { type: "removeEntry", id: "a" });
  assert.deepEqual(s.collections[0].items, []);
  assert.equal(s.entries.a, undefined);
  assert.equal(s.progress["a:1"].time, 20);
});
test("intro skip occurs only inside valid interval while enabled and only once", () => {
  const segment = { start: 30, end: 120 };
  assert.equal(skipTarget(31, segment, true, false, 1400), 120);
  assert.equal(skipTarget(31, segment, false, false, 1400), null);
  assert.equal(skipTarget(29, segment, true, false, 1400), null);
  assert.equal(skipTarget(121, segment, true, false, 1400), null);
  assert.equal(skipTarget(31, segment, true, true, 1400), null);
  assert.equal(
    skipTarget(31, { start: 30, end: 1500 }, true, false, 1400),
    null,
  );
});
test("independent next episode and autoplay settings, missing files, final episode", () => {
  assert.equal(
    nextEpisodeAction({ autoNext: false, autoPlay: true }, 1, 12, true),
    null,
  );
  assert.deepEqual(
    nextEpisodeAction({ autoNext: true, autoPlay: false }, 1, 12, true),
    { episode: 2, play: false },
  );
  assert.deepEqual(
    nextEpisodeAction({ autoNext: true, autoPlay: true }, 1, 12, true),
    { episode: 2, play: true },
  );
  assert.deepEqual(
    nextEpisodeAction({ autoNext: true, autoPlay: true }, 1, 12, false),
    { episode: 2, play: false },
  );
  assert.equal(
    nextEpisodeAction({ autoNext: true, autoPlay: true }, 12, 12, true),
    null,
  );
});
test("invalid intro timestamps rejected", () => {
  assert.throws(
    () =>
      applyOperation(defaults(), {
        type: "segments",
        key: "a:1",
        value: { start: 90, end: 30 },
      }),
    /invalidSegments/,
  );
});
test("restoring an older account keeps new preference defaults", () => {
  const s = normalize({ preferences: { language: "ja" } });
  assert.equal(s.preferences.language, "ja");
  assert.equal(s.preferences.autoNext, true);
  assert.ok(s.statuses.length);
});
test("all interface keys have nonempty Russian, English, and Japanese translations", () => {
  const keys = Object.keys(dictionaries.ru).sort();
  for (const l of ["en", "ja"])
    assert.deepEqual(Object.keys(dictionaries[l]).sort(), keys);
  for (const d of Object.values(dictionaries))
    for (const v of Object.values(d))
      assert.ok(typeof v === "string" && v.length > 0);
  assert.equal(dictionaries.ru.airing, "Онгоинг");
});
test("provider ongoing and block flags are retained; script URLs rejected", () => {
  const a = normalizeRelease({
    id: 7,
    name: { main: "Example" },
    episodes_total: 12,
    is_ongoing: true,
    is_blocked_by_geo: true,
    poster: { src: "javascript:alert(1)" },
  });
  assert.equal(a.ongoing, true);
  assert.equal(a.blocked, true);
  assert.equal(a.image, "");
  assert.equal(safeMediaURL("javascript:alert(1)"), null);
});
test("provider pagination sends search, ongoing and movie filters; blocked media never returned", async () => {
  const old = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url) => {
    seen = String(url);
    return {
      ok: true,
      json: async () => ({
        data: [{ id: 8, name: { main: "Movie" }, type: { value: "MOVIE" } }],
        meta: { pagination: { total: 45, total_pages: 2 } },
      }),
    };
  };
  try {
    const data = await fetchCatalogue({
      query: "test",
      page: 2,
      type: "MOVIE",
      ongoing: true,
    });
    assert.equal(data.total, 45);
    const u = new URL(seen);
    assert.equal(u.searchParams.get("f[search]"), "test");
    assert.equal(u.searchParams.get("f[types]"), "MOVIE");
    assert.equal(u.searchParams.get("f[publish_statuses]"), "IS_ONGOING");
    assert.equal(u.searchParams.get("page"), "2");
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        id: 999,
        name: { main: "Blocked" },
        is_blocked_by_copyrights: true,
        episodes: [{ hls_720: "https://example.org/a.m3u8" }],
      }),
    });
    await assert.rejects(
      () => providerEpisode("lib-999", 1),
      /providerBlocked/,
    );
  } finally {
    globalThis.fetch = old;
  }
});
test('retrying a committed create does not create duplicate pages or statuses',()=>{
 for(const type of ['createStatus','createCollection']){const op={type,id:'stable',name:'Weekend'};const once=applyOperation(defaults(),op);assert.deepEqual(applyOperation(once,op),once);}
});
test('a delayed device cannot overwrite newer playback progress',()=>{
 const s=applyOperation(defaults(),{type:'progress',key:'a:1',value:{time:100,updated:200}});
 const next=applyOperation(s,{type:'progress',key:'a:1',value:{time:20,updated:100}});
 assert.equal(next.progress['a:1'].time,100);
});

test('default lists match the requested order with no on-hold entry',()=>{
 assert.deepEqual(defaults().statuses.map(s=>s.id),['favorites','watching','planned','dropped','completed','ongoing']);
});
test('unified lists preserve all legacy memberships and ratings, and migrate idempotently',()=>{
 let s=defaults();s.statuses.push({id:'onhold',key:'onhold'});
 s.collections=[{id:'friends',name:'С друзьями',items:['a','b']},{id:'weekend',name:'Выходные',items:['a']}];
 s.entries={a:{status:'watching',rating:9},b:{status:'onhold'}};
 const next=applyOperation(s,{type:'unifyLists'});
 assert.deepEqual(next.collections,[]);assert.equal(next.entries.a.rating,9);
 assert.deepEqual(next.entries.a.legacyLists,['friends','weekend']);
 assert.equal(next.entries.b.status,null);assert.ok(next.statuses.some(v=>v.id==='friends'));
 assert.deepEqual(applyOperation(next,{type:'unifyLists'}),next);
 const changed=applyOperation(next,{type:'entry',id:'a',patch:{status:'weekend'}});
 assert.deepEqual(changed.entries.a.legacyLists,[]);assert.equal(changed.entries.a.status,'weekend');
 const removed=applyOperation(next,{type:'deleteStatus',id:'friends'});
 assert.deepEqual(removed.entries.a.legacyLists,['weekend']);
 assert.equal(s.collections.length,2);
});
