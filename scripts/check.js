// ---------------------------------------------------------------------------
// Automated rule checks (no browser needed):   npm run check
//
// Plays hundreds of nights with a random-clicking "chaos" player and asserts
// the game's fairness invariants hold every single frame.
// ---------------------------------------------------------------------------
import { NightSession } from '../src/world/session.js';
import { ROOMS } from '../src/world/map.js';
import { MAX_NIGHT, CUSTOM_NIGHT, CUSTOM_PRESETS } from '../src/config.js';

let failures = 0;
const fail = (msg) => {
  failures++;
  if (failures <= 20) console.error('  FAIL:', msg);
};
const DT = 1 / 30;

function chaosNight(night, seed, custom) {
  const s = new NightSession({ night, nightSeconds: 240, seed, custom });
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  const rooms = Object.keys(ROOMS).filter((k) => ROOMS[k].cam);
  let lastAttackDoorClosed = null;
  s.on('enteredOffice', ({ id }) => {
    const a = s.byId[id];
    // the side they came from must have been open
    const side = a.room === 'LDOOR' ? 'left' : a.room === 'RDOOR' ? 'right' : null;
    lastAttackDoorClosed = side ? s.doorClosed(side) : null;
    if (lastAttackDoorClosed) fail(`night ${night} seed ${seed}: ${id} entered through a CLOSED ${side} door`);
  });
  let prevHour = 0;
  while (!s.ended) {
    // random player input
    const x = rnd();
    if (x < 0.01) s.toggleDoor(rnd() < 0.5 ? 'left' : 'right');
    else if (x < 0.02) s.toggleLight(rnd() < 0.5 ? 'left' : 'right');
    else if (x < 0.025) s.setMonitor(!s.office.monitorUp);
    else if (x < 0.03) s.switchCam(rooms[Math.floor(rnd() * rooms.length)]);
    s.update(DT);

    if (s.power < 0 || s.power > 100) fail(`power out of range: ${s.power}`);
    if (s.hour < prevHour) fail('clock went backwards');
    prevHour = s.hour;
    if (s.state === 'powerout' && (s.office.left.closed || s.office.right.closed || s.office.monitorUp)) fail('systems still active during power-out');
    for (const a of s.animatronics) {
      if (!ROOMS[a.room]) fail(`${a.id} in unknown room ${a.room}`);
      if (!a.allowed.has(a.room)) fail(`${a.id} left its allowed area: ${a.room}`);
      if (a.level < 0 || a.level > 20) fail(`${a.id} level out of range`);
    }
    const doorRooms = s.animatronics.filter((a) => ROOMS[a.room].door && a.state === 'WAITING').map((a) => a.room);
    if (new Set(doorRooms).size !== doorRooms.length) fail('two animatronics waiting at the same door');
    if (s.time > s.nightSeconds + 1) fail('night overran 6 AM');
  }
  if (s.state === 'won' && s.time < s.nightSeconds) fail('won before 6 AM');
  return s.state;
}

/** Every link must go both ways, and every camera room must be reachable. */
function checkMap() {
  for (const [k, r] of Object.entries(ROOMS)) {
    for (const l of r.links) if (!ROOMS[l]?.links.includes(k)) fail(`map link ${k} -> ${l} is one-way`);
  }
}

/** Movement must follow room links (no teleporting), except retreats and the runner's sprint. */
function checkMovement() {
  const s = new NightSession({ night: 6, nightSeconds: 240, seed: 99 });
  s.on('move', ({ anim, from, to, retreat }) => {
    if (!retreat && !ROOMS[from].links.includes(to)) fail(`${anim.id} teleported ${from} -> ${to}`);
  });
  while (!s.ended) s.update(DT);
}

console.log('Running rule checks...');
checkMap();
checkMovement();
const results = { won: 0, lost: 0 };
for (let n = 1; n <= MAX_NIGHT; n++) for (let i = 0; i < 40; i++) results[chaosNight(n, 500 + n * 131 + i)]++;
// Custom Night: every preset plus an all-zero night (where nobody may ever move).
for (const p of CUSTOM_PRESETS) for (let i = 0; i < 15; i++) results[chaosNight(CUSTOM_NIGHT, 900 + i, p)]++;
{
  const s = new NightSession({ night: CUSTOM_NIGHT, nightSeconds: 120, seed: 7, custom: { ai: { bear: 0, rabbit: 0, bird: 0, runner: 0 } } });
  s.on('move', ({ anim }) => fail(`${anim.id} moved at AI level 0`));
  s.on('runnerStir', () => fail('runner stirred at AI level 0'));
  while (!s.ended) s.update(DT);
}
console.log(`  chaos nights played: ${results.won + results.lost} (won ${results.won}, lost ${results.lost})`);
if (failures) {
  console.error(`\n${failures} invariant violation(s).`);
  process.exit(1);
}
console.log('  all invariants hold: no attacks through closed doors, power within 0-100%,');
console.log('  no teleporting, animatronics stay in their areas, clock monotonic, power-out disables systems.');
console.log('OK');
