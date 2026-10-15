// Keep unfinished fields across redraws, but never across accounts.
export function createProfileDraft() {
  let owner = null, fields = {};
  return {
    set(uid, name, value) {
      if (uid !== owner) { owner = uid; fields = {}; }
      if (['name', 'bio', 'language', 'theme'].includes(name)) fields[name] = value;
    },
    get(uid) { return uid === owner ? {...fields} : {}; },
    clear() { owner = null; fields = {}; },
  };
}

// A slower request for an old photo/account must not replace the current one.
export function createAvatarLoader({identity, sign, display, schedule = setTimeout, cancel = clearTimeout}) {
  let generation = 0, timer;
  async function refresh() {
    const own = ++generation, {uid, path} = identity();
    cancel(timer);
    if (!uid || !path) { display(''); return; }
    let url = '';
    try { url = await sign(path); } catch {}
    const current = identity();
    if (own !== generation || uid !== current.uid || path !== current.path) return;
    display(url || '');
    timer = schedule(refresh, url ? 50 * 60 * 1000 : 60 * 1000);
  }
  return {refresh, reset() { ++generation; cancel(timer); display(''); }};
}
