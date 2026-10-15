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

export function getNightConfig(night) {
  const n = Math.max(1, Math.min(MAX_NIGHT, night | 0));
  return { night: n, hourBonus: HOUR_BONUS, ...NIGHTS[n] };
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
  debug: false,
};
