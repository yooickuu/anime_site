import {rebaseProgress} from './episode-manifest.js';
export const statuses = [
  "watching",
  "planned",
  "dropped",
  "completed",
  "ongoing",
];
export const initialStatuses = () =>
  ["favorites", ...statuses].map((id) => ({ id, key: id }));
export const defaults = () => ({
  statuses: initialStatuses(),
  entries: {},
  collections: [],
  progress: {},
  segments: {},
  preferences: {
    autoSkip: false,
    autoNext: true,
    autoPlay: true,
    speed: 1,
    quality: 720,
    theme: "light",
    language: "ru",
    name: "",
    bio: "",
    avatar: "",
    banner: "",
  },
});
export function normalize(value) {
  const d = defaults();
  if (!value || typeof value !== "object") return d;
  return {
    ...d,
    ...value,
    statuses: Array.isArray(value.statuses)
      ? value.statuses
      : initialStatuses(),
    entries:
      value.entries && typeof value.entries === "object" ? value.entries : {},
    collections: Array.isArray(value.collections) ? value.collections : [],
    progress:
      value.progress && typeof value.progress === "object"
        ? value.progress
        : {},
    segments:
      value.segments && typeof value.segments === "object"
        ? value.segments
        : {},
    preferences: { ...d.preferences, ...value.preferences },
  };
}
export function applyOperation(value, op) {
  const s = structuredClone(normalize(value));
  switch (op.type) {
    case "entry": {
      const e = s.entries[op.id] || {
        status: s.statuses.some((v) => v.id === "planned") ? "planned" : null,
        favorite: false,
      };
      if (op.patch.status && !s.statuses.some((v) => v.id === op.patch.status))
        throw Error("invalidStatus");
      s.entries[op.id] = { ...e, ...op.patch };
      if (Object.hasOwn(op.patch,'status')) s.entries[op.id].legacyLists = [];
      break;
    }
    case "unifyLists": {
      // Preserve all memberships from the old multi-list model during migration.
      for(const c of s.collections) {
        if(!s.statuses.some(v=>v.id===c.id))s.statuses.push({id:c.id,name:c.name});
        for(const id of c.items) {
          const e=s.entries[id] ||= {status:null,favorite:false};
          e.legacyLists=[...new Set([...(e.legacyLists||[]),c.id])];
          if(!e.status)e.status=c.id;
        }
      }
      s.collections=[];
      if(s.statuses.some(v=>v.id==='onhold'&&v.key==='onhold')) {
        s.statuses=s.statuses.filter(v=>v.id!=='onhold');
        for(const e of Object.values(s.entries))if(e.status==='onhold')e.status=null;
      }
      const order=['favorites','watching','planned','dropped','completed','ongoing'];
      s.statuses.sort((a,b)=>(order.includes(a.id)?order.indexOf(a.id):99)-(order.includes(b.id)?order.indexOf(b.id):99));
      break;
    }
    case "createStatus": {
      if (s.statuses.some(v=>v.id===op.id)) break;
      const name = op.name.trim();
      if (!name || name.length > 60) throw Error("invalidName");
      if (s.statuses.length >= 30) throw Error("statusLimit");
      if(s.statuses.some(v=>v.name?.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error("duplicateName");
      s.statuses.push({ id: op.id, name });
      break;
    }
    case "deleteStatus": {
      s.statuses = s.statuses.filter((v) => v.id !== op.id);
      for (const e of Object.values(s.entries)) {
        if (e.status === op.id) e.status = null;
        e.legacyLists=(e.legacyLists||[]).filter(id=>id!==op.id);
        if (op.id === "favorites") e.favorite = false;
      }
      break;
    }
    case "renameStatus": {
      const name = op.name.trim();
      if (!name || name.length > 60) throw Error("invalidName");
      if(s.statuses.some(v=>v.id!==op.id&&v.name?.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error("duplicateName");
      s.statuses = s.statuses.map((v) =>
        v.id === op.id ? { id: v.id, name } : v,
      );
      break;
    }
    case "removeEntry":
      delete s.entries[op.id];
      s.collections = s.collections.map((c) => ({
        ...c,
        items: c.items.filter((id) => id !== op.id),
      }));
      break;
    case "createCollection": {
      if (s.collections.some(v=>v.id===op.id)) break;
      const name = op.name.trim();
      if (!name || name.length > 60) throw Error("invalidName");
      if (s.collections.length >= 50) throw Error("collectionLimit");
      if (
        s.collections.some(
          (c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      )
        throw Error("duplicateName");
      s.collections.push({ id: op.id, name, items: [] });
      break;
    }
    case "renameCollection": {
      const name = op.name.trim();
      if (!name || name.length > 60) throw Error("invalidName");
      if (
        s.collections.some(
          (c) =>
            c.id !== op.id &&
            c.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      )
        throw Error("duplicateName");
      s.collections = s.collections.map((c) =>
        c.id === op.id ? { ...c, name } : c,
      );
      break;
    }
    case "deleteCollection":
      s.collections = s.collections.filter((c) => c.id !== op.id);
      break;
    case "collectionItem":
      s.collections = s.collections.map((c) =>
        c.id === op.collectionId
          ? {
              ...c,
              items: op.add
                ? [...new Set([...c.items, op.id])]
                : c.items.filter((id) => id !== op.id),
            }
          : c,
      );
      if (op.add && !s.entries[op.id])
        s.entries[op.id] = {
          status: s.statuses.some((v) => v.id === "planned") ? "planned" : null,
          favorite: false,
        };
      break;
    case "preferences":
      s.preferences = { ...s.preferences, ...op.patch };
      break;
    case "rebaseEpisodes":
      s.progress=rebaseProgress(s.progress,op.id,op.numbers);
      break;
    case "progress":
      if ((s.progress[op.key]?.updated || 0) > (op.value.updated || 0)) break;
      s.progress[op.key] = op.value;
      break;
    case "segments":
      if (!validSegments(op.value)) throw Error("invalidSegments");
      s.segments[op.key] = op.value;
      break;
    default:
      throw Error("invalidOperation");
  }
  return s;
}
export function validSegments(v) {
  return (
    v &&
    Number.isFinite(v.start) &&
    Number.isFinite(v.end) &&
    v.start >= 0 &&
    v.end > v.start &&
    v.end <= 86400
  );
}
export function skipTarget(time, segment, enabled, alreadySkipped, duration) {
  if (
    !enabled ||
    !Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0 ||
    alreadySkipped ||
    !validSegments(segment) ||
    segment.end >= duration
  )
    return null;
  return time >= segment.start && time < segment.end ? segment.end : null;
}
export function nextEpisodeAction(settings, episode, total, hasSource) {
  if (!settings.autoNext || episode >= total) return null;
  return { episode: episode + 1, play: !!settings.autoPlay && hasSource };
}
export function timeLabel(s) {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function episodeNavigation(episode, total) {
  return { previous: total > 1 && episode > 1, next: total > 1 && episode < total };
}
export function profileStats(state) {
  const progress=Object.values(state.progress||{}).filter(p=>p.id!=='sintel');
  const ratings=Object.values(state.entries||{}).map(e=>Number(e.rating)).filter(n=>n>=1 && n<=10);
  return {completedEpisodes:progress.filter(p=>p.completed).length,averageRating:ratings.length?(ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1):'—'};
}
