export const admissionPolicy = Object.freeze({
  version: 3,
  batchSize: 250,
  qualities: [360, 480, 720, 1080],
  minimumQuality: 720,
  qualityMode: 'real-available-720-or-better',
  audio: { ru: 2, en: 1, ja: 1 },
  subtitles: ['ru', 'en', 'ja']
});

export const normalized = s => String(s || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

export const fresh = (proof, now = Date.now(), maxAge = 86400000) => {
  if (!proof) return false;
  if (proof.passed !== true) return false;
  const time = Date.parse(proof.checkedAt);
  if (!Number.isFinite(time)) return false;
  if (time > now) return false;
  if (Number.isFinite(maxAge) && (now - time > maxAge)) return false;
  return true;
};

export const mediaURL = value => {
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password;
  } catch {
    return false;
  }
};

export function identityKeys(a) {
  return ['mal', 'anilist', 'shikimori', 'kodik', 'anilibria'].flatMap(k => {
    const val = a.ids?.[k];
    if (Number.isSafeInteger(val) && val > 0) return [`${k}:${val}`];
    if (typeof val === 'string' && val.trim()) return [`${k}:${val.trim()}`];
    return [];
  });
}

export function auditAdmission(a, { now = Date.now(), playerSubtitlesReady = true, strict = true, maxAge = 86400000 } = {}) {
  const issues = [];
  const fail = (code, path) => issues.push({ code, path });

  for (const issue of a.assemblyIssues || []) fail(issue.code, issue.path);
  if (!identityKeys(a).length) fail('canonical_identity_missing', 'ids');
  if (strict && !fresh(a.evidence?.identity, now, maxAge)) fail('identity_unverified', 'evidence.identity');
  if (!playerSubtitlesReady) fail('player_subtitles_not_ready', 'player');

  const expected = a.releasedEpisodes || (a.episodes || []).map(e => e.number);
  const actual = (a.episodes || []).map(e => e.number);
  if (!Array.isArray(expected) || !expected.length || !expected.every(n => Number.isFinite(n) && (strict ? n > 0 : n >= 0)) || new Set(expected).size !== expected.length) {
    fail('release_manifest_missing', 'releasedEpisodes');
  }
  if (strict && !fresh(a.evidence?.releaseManifest, now, maxAge)) fail('release_manifest_unverified', 'evidence.releaseManifest');
  if (new Set(actual).size !== actual.length || expected?.length !== actual.length || expected?.some(n => !actual.includes(n))) {
    fail('episode_coverage_mismatch', 'episodes');
  }

  const minDims = strict ? [['poster', 800, 1200], ['backdrop', 1920, 1080]] : [['poster', 200, 300], ['backdrop', 400, 200]];
  for (const [key, minWidth, minHeight] of minDims) {
    const image = a.artwork?.[key];
    if (!mediaURL(image?.url) || image.width < minWidth || image.height < minHeight || !Number.isFinite(image.width) || !Number.isFinite(image.height)) {
      fail('artwork_resolution_missing', `artwork.${key}`);
    }
    if (strict && !fresh(image?.review, now, maxAge)) {
      fail('artwork_visual_review_missing', `artwork.${key}`);
    }
  }

  if (strict && (!fresh(a.evidence?.playerDesktop, now, maxAge) || !fresh(a.evidence?.playerMobile, now, maxAge))) {
    fail('player_acceptance_missing', 'evidence.player');
  }
  if (a.ongoing && strict && (!a.updates?.adapter || !a.updates?.schedule || !fresh(a.updates?.probe, now, maxAge))) {
    fail('automatic_updates_unverified', 'updates');
  }

  for (const e of a.episodes || []) {
    const path = `episodes.${e.number}`;
    const audio = e.audio || [];
    if (!audio.length) fail('audio_missing', `${path}.audio`);

    if (strict) {
      for (const [language, count] of Object.entries(admissionPolicy.audio)) {
        const tracks = audio.filter(t => t.language === language);
        const distinct = new Set(tracks.map(t => normalized(t.dubId)).filter(Boolean));
        if (distinct.size < count) fail('audio_language_missing', `${path}.audio.${language}`);
      }
      if (!audio.some(t => t.language === 'ja' && t.original === true)) fail('japanese_original_unverified', path);
    }

    const ids = audio.map(t => t.id);
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) fail('duplicate_audio_id', path);

    for (const track of audio) {
      issues.push(...auditAudioTrack(track, { now, path: `${path}.audio.${track.id}`, strict, maxAge }));
    }
  }

  return { id: a.id, passed: issues.length === 0, issues };
}

export function auditBatch(candidates, { existing = [], ...options } = {}) {
  const seen = new Map();
  for (const a of existing) for (const k of identityKeys(a)) seen.set(k, a.id);
  return candidates.map(a => {
    const result = auditAdmission(a, options);
    for (const k of identityKeys(a)) {
      if (seen.has(k)) result.issues.push({ code: 'duplicate_release', path: k, existingId: seen.get(k) });
    }
    for (const k of identityKeys(a)) {
      if (!seen.has(k)) seen.set(k, a.id);
    }
    result.passed = result.issues.length === 0;
    return result;
  });
}

export function auditAudioTrack(track, { now = Date.now(), path = "audio", strict = true, maxAge = 86400000 } = {}) {
  const issues = [];
  const fail = (code, p) => issues.push({ code, path: p });
  const p = path;

  // Lightweight imports explicitly store a validated provider link, not invented streams/quality.
  let linked=false;
  if(!strict&&track.validation==='provider-link'&&track.providerRef?.provider==='kodik'){
    try{const u=new URL(track.providerRef.url);linked=u.protocol==='https:'&&['kodikplayer.com','kodik.info','kodik.biz','kodik.cc'].includes(u.hostname)&&!u.username&&!u.password&&!u.port&&/^\/(seria|video|serial)\/\d+\/[a-z0-9]+\//i.test(u.pathname)&&track.id===`kodik-${track.providerRef.translationId}`&&Number.isFinite(track.providerRef.ordinal);}catch{}
  }
  if (!linked&&(!Number.isFinite(track.duration) || track.duration <= 0)) fail('duration_unverified', p);
  if (strict && !fresh(track.languageReview, now, maxAge)) fail('audio_language_unverified', p);

  const sources = track.sources || [];
  const minQuality = strict ? admissionPolicy.minimumQuality : 360;
  if (!linked&&!sources.some(s => admissionPolicy.qualities.includes(s.quality) && s.quality >= minQuality)) {
    fail('quality_unverified', `${p}.minimumHD`);
  }

  const qualities = new Set();
  for (const s of sources) {
    if (!admissionPolicy.qualities.includes(s.quality) || qualities.has(s.quality)) {
      fail('invalid_quality', `${p}.${s.quality}`);
    }
    qualities.add(s.quality);
    if (!mediaURL(s.url) || (strict && s.height !== s.quality)) fail('quality_unverified', `${p}.${s.quality}`);
    if (strict && (!fresh(s.probe, now, maxAge) || s.probe?.decoded !== true || s.probe?.browserPlayable !== true)) {
      fail('quality_unverified', `${p}.${s.quality}`);
    }
  }

  if (strict) {
    for (const language of admissionPolicy.subtitles) {
      const sub = track.subtitles?.find(s => s.language === language);
      if (!mediaURL(sub?.url) || sub.format !== 'vtt' || !fresh(sub.review, now, maxAge) || sub.review?.synchronized !== true) {
        fail('subtitle_unverified', `${p}.subtitles.${language}`);
      }
    }
  } else {
    for (const sub of track.subtitles || []) {
      if (!mediaURL(sub?.url) || sub.format !== 'vtt') {
        fail('subtitle_unverified', `${p}.subtitles.${sub.language}`);
      }
    }
  }

  for (const kind of ['opening', 'ending']) {
    const mark = track[kind];
    if (strict) {
      if (!fresh(mark?.review, now, maxAge) || !(mark?.absent === true || (Number.isFinite(mark?.start) && Number.isFinite(mark?.end) && mark.start >= 0 && mark.end > mark.start && mark.end <= track.duration))) {
        fail('skip_timing_unverified', `${p}.${kind}`);
      }
    } else if (mark && mark.absent !== true) {
      if (!(Number.isFinite(mark?.start) && Number.isFinite(mark?.end) && mark.start >= 0 && mark.end > mark.start && mark.end <= track.duration)) {
        fail('skip_timing_unverified', `${p}.${kind}`);
      }
    }
  }

  return issues;
}
