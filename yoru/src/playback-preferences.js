// Preferences contain no viewing history and can also be used by guests.
export function soundPreferences(preferences = {}) {
  const volume = Number(preferences.volume ?? 1);
  return {volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1, muted: preferences.muted === true};
}

export function preferredAudio(choices, preferences, animeId) {
  const saved = preferences.audioByAnime?.[animeId];
  return choices.find(a => a.id === saved)?.id
    || choices.find(a => a.id === preferences.audio)?.id
    || choices[0]?.id || '';
}

export function resumeTime(saved, signedIn, override) {
  const value = override ?? (signedIn && !saved?.completed ? saved?.time : 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
