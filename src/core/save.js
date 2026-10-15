// ---------------------------------------------------------------------------
// Progression + settings persistence (localStorage). Every read is validated,
// so missing, partial or corrupted data falls back to sane defaults.
// ---------------------------------------------------------------------------
import { DEFAULT_SETTINGS, MAX_NIGHT, CONFIG } from '../config.js';

const KEY = 'midnightshift.save.v1';

function defaults() {
  return {
    version: 1,
    unlockedNight: 1, // highest night that can be selected
    nextNight: 1, // what "Continue" starts
    completed: [], // nights that have been beaten
    tutorialDone: false,
    settings: { ...DEFAULT_SETTINGS },
  };
}

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null; // privacy mode / disabled storage
  }
}

const clampInt = (v, lo, hi, fallback) => (Number.isInteger(v) && v >= lo && v <= hi ? v : fallback);
const clampNum = (v, lo, hi, fallback) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Sanitise arbitrary parsed JSON into a valid save object. */
export function sanitizeSave(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const out = defaults();
  out.completed = Array.isArray(raw.completed)
    ? [...new Set(raw.completed.filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_NIGHT))].sort()
    : [];
  // A beaten night always unlocks the one after it, even if the stored value is broken.
  const fromCompleted = out.completed.length ? Math.min(MAX_NIGHT, Math.max(...out.completed) + 1) : 1;
  out.unlockedNight = Math.max(fromCompleted, clampInt(raw.unlockedNight, 1, MAX_NIGHT, d.unlockedNight));
  out.nextNight = clampInt(raw.nextNight, 1, out.unlockedNight, out.unlockedNight);
  out.tutorialDone = raw.tutorialDone === true;

  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const ds = DEFAULT_SETTINGS;
  out.settings = {
    masterVolume: clampNum(s.masterVolume, 0, 1, ds.masterVolume),
    sfxVolume: clampNum(s.sfxVolume, 0, 1, ds.sfxVolume),
    ambienceVolume: clampNum(s.ambienceVolume, 0, 1, ds.ambienceVolume),
    muted: typeof s.muted === 'boolean' ? s.muted : ds.muted,
    visualEffects: ['full', 'reduced', 'off'].includes(s.visualEffects) ? s.visualEffects : ds.visualEffects,
    reducedFlashing: typeof s.reducedFlashing === 'boolean' ? s.reducedFlashing : ds.reducedFlashing,
    screenShake: typeof s.screenShake === 'boolean' ? s.screenShake : ds.screenShake,
    nightMinutes: CONFIG.nightLengthOptions.includes(s.nightMinutes) ? s.nightMinutes : ds.nightMinutes,
    tutorial: typeof s.tutorial === 'boolean' ? s.tutorial : ds.tutorial,
    debug: typeof s.debug === 'boolean' ? s.debug : ds.debug,
  };
  return out;
}

export function loadSave() {
  const st = storage();
  if (!st) return defaults();
  try {
    const txt = st.getItem(KEY);
    if (!txt) return defaults();
    return sanitizeSave(JSON.parse(txt));
  } catch (e) {
    console.warn('[save] corrupted save data, using defaults', e);
    return defaults();
  }
}

export function writeSave(save) {
  const st = storage();
  if (!st) return false;
  try {
    st.setItem(KEY, JSON.stringify(save));
    return true;
  } catch (e) {
    console.warn('[save] could not write save', e);
    return false;
  }
}

/** Record a beaten night and unlock the next one. Returns the updated save. */
export function recordNightComplete(save, night) {
  if (!save.completed.includes(night)) save.completed.push(night);
  save.completed.sort();
  const next = Math.min(MAX_NIGHT, night + 1);
  save.unlockedNight = Math.max(save.unlockedNight, next);
  save.nextNight = night >= MAX_NIGHT ? MAX_NIGHT : next;
  writeSave(save);
  return save;
}

/** Wipe progression but keep the player's settings. */
export function resetProgress(save) {
  const fresh = defaults();
  fresh.settings = { ...save.settings };
  writeSave(fresh);
  return fresh;
}

export function hasProgress(save) {
  return save.unlockedNight > 1 || save.completed.length > 0;
}
