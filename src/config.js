// ---------------------------------------------------------------------------
// Global configuration and per-night difficulty tables.
// Everything that affects balance lives here so it can be tuned in one place
// (and exercised headlessly by scripts/simulate.js).
// ---------------------------------------------------------------------------

export const VIEW_W = 1280;
export const VIEW_H = 720;
/** Width of the panoramic office the player looks around in. */
export const WORLD_W = 1920;

export const CONFIG = {
  title: 'MIDNIGHT SHIFT',
  subtitle: "Mortimer's Forgotten Diner",

  /** Real-time minutes for one full night (12 AM -> 6 AM). Changeable in Settings. */
  defaultNightMinutes: 7,
  nightLengthOptions: [4, 6, 7, 8],
  hoursPerNight: 6,

  power: {
    // % drained per second for every active "usage unit" on a 7 minute night.
    // Drain is rescaled for other night lengths so balance stays identical.
    referenceNightSeconds: 420,
    unitDrainPerSec: 0.09,
  },

  monitorAnimTime: 0.26,
  doorAnimTime: 0.2,
  /** Seconds the camera is unusable while an animatronic moves through it. */
  moveDisruptPadding: 0.5,
};

/** Character roster. Names and designs are original. */
export const CHARACTERS = {
  bear:   { id: 'bear',   name: 'MORTIMER',  title: 'Mortimer the Bear',   color: '#6b4a33' },
  rabbit: { id: 'rabbit', name: 'HOPSCOTCH', title: 'Hopscotch the Rabbit', color: '#b8ad98' },
  bird:   { id: 'bird',   name: 'PIPPA',     title: 'Pippa the Parrot',     color: '#3f6b5e' },
  runner: { id: 'runner', name: 'SCRAPS',    title: 'Scraps the Hound',     color: '#6d6a63' },
};

// AI levels run 0..20 (roll a d20 each movement opportunity: act if roll <= level).
// hourBonus is added on top as the night goes on (keys are the in-game hour 1..5).
const HOUR_BONUS = {
  2: { rabbit: 1 },
  3: { rabbit: 1, bird: 1, runner: 1 },
  4: { rabbit: 1, bird: 1, runner: 1, bear: 1 },
};

export const NIGHTS = {
  1: {
    ai: { bear: 0, rabbit: 3, bird: 2, runner: 1 },
    drainMult: 0.85, linger: 12, bearLinger: 18, runnerCharge: 4.4, runnerIgnore: 75, flank: false,
    memo: "Welcome aboard. Watch the cameras, mind the power, and keep the doors shut only when you must. The characters get... restless at night. Don't take it personally.",
  },
  2: {
    ai: { bear: 0, rabbit: 6, bird: 5, runner: 3 },
    drainMult: 0.92, linger: 10.5, bearLinger: 16, runnerCharge: 4.0, runnerIgnore: 65, flank: false,
    memo: "Night two. Somebody keeps leaving the storage curtain open. If you see anything moving back there, just keep an eye on it. Constantly.",
  },
  3: {
    ai: { bear: 2, rabbit: 8, bird: 8, runner: 4 },
    drainMult: 0.95, linger: 9, bearLinger: 14, runnerCharge: 3.6, runnerIgnore: 55, flank: true,
    memo: "Mortimer has started leaving the stage. He doesn't like being watched, and he likes it even less when you stare at the monitor while he's at your door.",
  },
  4: {
    ai: { bear: 5, rabbit: 10, bird: 10, runner: 6 },
    drainMult: 0.98, linger: 8, bearLinger: 12, runnerCharge: 3.3, runnerIgnore: 45, flank: true,
    memo: "The previous guard left a note scratched into the desk: 'THEY LEARN'. Probably nothing. Please don't damage company property.",
  },
  5: {
    ai: { bear: 7, rabbit: 12, bird: 12, runner: 8 },
    drainMult: 1.0, linger: 7, bearLinger: 10, runnerCharge: 3.0, runnerIgnore: 38, flank: true,
    memo: "Final night of the week. Corporate is shutting this location down for good on Monday. Whatever happens tonight... stays here.",
  },
  6: {
    ai: { bear: 10, rabbit: 14, bird: 14, runner: 10 },
    drainMult: 1.0, linger: 6.5, bearLinger: 8.5, runnerCharge: 2.8, runnerIgnore: 32, flank: true,
    memo: "CHALLENGE NIGHT. You're not scheduled tonight. Nobody is. So why is the phone still ringing?",
  },
};

export const MAX_NIGHT = 6;
export const MAIN_NIGHTS = 5;

/** Night number used for the player-configured Custom Night. */
export const CUSTOM_NIGHT = 7;

export function getNightConfig(night, custom) {
  if (night === CUSTOM_NIGHT) return buildCustomConfig(custom);
  const n = Math.max(1, Math.min(MAX_NIGHT, night | 0));
  return { night: n, hourBonus: HOUR_BONUS, ...NIGHTS[n] };
}

// ── Custom Night ───────────────────────────────────────────────────────────

export const CUSTOM_AI_IDS = ['bear', 'rabbit', 'bird', 'runner'];

export const CUSTOM_MODIFIERS = [
  { id: 'surge', name: 'Power Surge', desc: 'Power drains 30% faster.', points: 150 },
  { id: 'wiring', name: 'Faulty Wiring', desc: 'Cameras cut out at random.', points: 100 },
  { id: 'restless', name: 'Restless', desc: 'Everyone gains +1 AI level every hour.', points: 150 },
];

export const CUSTOM_PRESETS = [
  { name: 'Quiet Night', ai: { bear: 2, rabbit: 3, bird: 3, runner: 2 }, mods: {} },
  { name: 'Last Week', ai: { ...NIGHTS[5].ai }, mods: {} },
  { name: 'Kennel', ai: { bear: 0, rabbit: 0, bird: 0, runner: 20 }, mods: {} },
  { name: 'Feathers & Fur', ai: { bear: 0, rabbit: 16, bird: 16, runner: 0 }, mods: { wiring: true } },
  { name: 'Showtime', ai: { bear: 20, rabbit: 5, bird: 5, runner: 5 }, mods: { restless: true } },
  { name: '20/20/20/20', ai: { bear: 20, rabbit: 20, bird: 20, runner: 20 }, mods: { surge: true, wiring: true, restless: true } },
];

export const DEFAULT_CUSTOM = { ai: { bear: 5, rabbit: 5, bird: 5, runner: 5 }, mods: {} };

const clampLevel = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(20, Math.round(v))) : 0);

/** Normalise any (possibly broken) custom setup into {ai, mods}. */
export function normalizeCustom(custom) {
  const ai = {};
  for (const id of CUSTOM_AI_IDS) ai[id] = clampLevel(custom?.ai?.[id] ?? DEFAULT_CUSTOM.ai[id]);
  const mods = {};
  for (const m of CUSTOM_MODIFIERS) mods[m.id] = custom?.mods?.[m.id] === true;
  return { ai, mods };
}

/** Score for surviving a custom setup: 10 points per AI level + modifier bonuses. */
export function customScore(custom) {
  const c = normalizeCustom(custom);
  let score = CUSTOM_AI_IDS.reduce((sum, id) => sum + c.ai[id] * 10, 0);
  for (const m of CUSTOM_MODIFIERS) if (c.mods[m.id]) score += m.points;
  return score;
}

export const CUSTOM_MAX_SCORE = 20 * 10 * CUSTOM_AI_IDS.length + CUSTOM_MODIFIERS.reduce((s, m) => s + m.points, 0);

/** Short description of a custom setup (used for the intro card). */
export function describeCustom(custom) {
  const c = normalizeCustom(custom);
  const levels = CUSTOM_AI_IDS.map((id) => `${CHARACTERS[id].name} ${c.ai[id]}`).join('  ·  ');
  const mods = CUSTOM_MODIFIERS.filter((m) => c.mods[m.id]).map((m) => m.name.toUpperCase());
  return `${levels}${mods.length ? `  ·  ${mods.join(' + ')}` : ''}.  Worth ${customScore(c)} points if you see 6 AM.`;
}

const lerp = (a, b, k) => a + (b - a) * k;

/**
 * Derive a full night config from slider values. Timings (door linger, Scraps'
 * sprint, ...) scale between the Night 1 and Challenge Night values.
 */
export function buildCustomConfig(custom) {
  const { ai, mods } = normalizeCustom(custom);
  const avg = CUSTOM_AI_IDS.reduce((s, id) => s + ai[id], 0) / (20 * CUSTOM_AI_IDS.length);
  const hourBonus = {};
  if (mods.restless) for (let h = 1; h <= 5; h++) hourBonus[h] = { bear: 1, rabbit: 1, bird: 1, runner: 1 };
  return {
    night: CUSTOM_NIGHT,
    custom: true,
    ai,
    mods,
    hourBonus,
    drainMult: mods.surge ? 1.3 : 1.0,
    linger: lerp(12, 6, avg),
    bearLinger: lerp(18, 8, ai.bear / 20),
    runnerCharge: lerp(4.4, 2.7, ai.runner / 20),
    runnerIgnore: lerp(75, 30, ai.runner / 20),
    flank: avg >= 0.3,
    wiring: mods.wiring,
    memo: describeCustom({ ai, mods }),
  };
}

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  ambienceVolume: 0.7,
  muted: false,
  visualEffects: 'full', // 'full' | 'reduced' | 'off'
  reducedFlashing: false,
  screenShake: true,
  nightMinutes: 7,
  tutorial: true,
  phoneCalls: true,
  debug: false,
};
