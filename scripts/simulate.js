// ---------------------------------------------------------------------------
// Headless balance simulator: plays many nights with a scripted "reasonable
// human" bot and reports win rates / remaining power per night.
//
//   npm run simulate            (100 runs per night)
//   node scripts/simulate.js 300
//
// The bot only uses information a player has: hallway lights, camera feeds
// and audio cues (with a reaction delay). It is deliberately imperfect.
// ---------------------------------------------------------------------------
import { NightSession } from '../src/world/session.js';
import { MAX_NIGHT } from '../src/config.js';

const RUNS = Number(process.argv[2]) || 100;
const DT = 1 / 30;
const NIGHT_SECONDS = 420;

function makeBot(s, r) {
  // Simple timeline-based behaviour.
  const bot = {
    nextCheck: r(2, 5),
    nextCams: r(6, 12),
    actions: [], // {at, fn}
    heard: { left: 0, right: 0 }, // urgency from audio cues
    lastStorage: 0,
  };
  const at = (delay, fn) => bot.actions.push({ at: s.time + delay, fn });

  s.on('atDoor', ({ side }) => {
    // Footsteps at the door: a human notices maybe 70% of the time.
    if (r(0, 1) < 0.7) at(r(0.8, 2.0), () => {
      s.setMonitor(false);
      at(0.3, () => peek(side));
    });
  });
  s.on('runnerSprint', ({ duration }) => {
    // Running feet + collar jingle - very noticeable. React in 0.6-1.6s.
    at(Math.min(duration - 0.3, r(0.6, 1.6)), () => {
      s.setMonitor(false);
      if (!s.doorClosed('left')) s.toggleDoor('left');
    });
  });
  s.on('doorBang', () => at(r(0.8, 1.5), () => peek('left')));

  function peek(side) {
    if (s.office.monitorUp || s.state !== 'running') return;
    s.setLight(side, true);
    at(0.5, () => {
      const who = s.atDoor(side);
      s.setLight(side, false);
      if (who && !s.doorClosed(side)) s.toggleDoor(side);
      if (!who && s.doorClosed(side) && !(side === 'left' && s.byId.runner.state === 'CHARGING')) s.toggleDoor(side);
      if (s.doorClosed(side)) at(r(2, 3.5), () => peek(side));
    });
  }

  bot.tick = () => {
    bot.actions.sort((a, b) => a.at - b.at);
    while (bot.actions.length && bot.actions[0].at <= s.time) bot.actions.shift().fn();
    if (s.state !== 'running') return;
    if (s.time >= bot.nextCheck && !s.office.monitorUp) {
      bot.nextCheck = s.time + r(4, 8);
      peek('left');
      at(0.7, () => peek('right'));
    }
    if (s.time >= bot.nextCams && !s.office.monitorUp) {
      bot.nextCams = s.time + r(10, 18);
      // A careful player checks both doors before burying their face in the monitor.
      peek('left');
      at(0.6, () => peek('right'));
      at(1.3, () => {
        if (s.atDoor('left') || s.atDoor('right') || s.state !== 'running') return;
        s.setMonitor(true);
        s.switchCam('STORAGE');
        const other = ['STAGE', 'DINING', 'WEST', 'EAST'][Math.floor(r(0, 4))];
        at(r(1.2, 2.2), () => s.switchCam(other));
        at(r(2.8, 4), () => s.setMonitor(false));
      });
    }
  };
  return bot;
}

function runNight(night, seed) {
  const s = new NightSession({ night, nightSeconds: NIGHT_SECONDS, seed });
  let rs = seed;
  const r = (lo, hi) => {
    rs = (rs * 1664525 + 1013904223) >>> 0;
    return lo + (hi - lo) * (rs / 4294967296);
  };
  const bot = makeBot(s, r);
  let steps = 0;
  const use = { door: 0, light: 0, mon: 0, t: 0 };
  while (!s.ended && steps < (NIGHT_SECONDS + 120) / DT) {
    bot.tick();
    s.update(DT);
    const o = s.office;
    use.door += (o.left.closed + o.right.closed) * DT;
    use.light += (o.left.light + o.right.light) * DT;
    use.mon += o.monitorUp * DT;
    use.t += DT;
    steps++;
  }
  return { won: s.state === 'won', killer: s.killer, power: s.power, poweredOut: !!s.powerOut, bangs: s.byId.runner.bangs, use };
}

// `node scripts/simulate.js find <night> <killer>` lists runs killed by <killer> without a power-out.
if (process.argv[2] === 'find') {
  const night = Number(process.argv[3]) || 1;
  const found = [];
  for (let i = 0; i < 200 && found.length < 5; i++) {
    const res = runNight(night, 1000 + i * 7919 + night);
    if (res.killer === process.argv[4] && !res.poweredOut) found.push(i);
  }
  console.log('run indices:', found.join(', ') || 'none');
  process.exit(0);
}

// `node scripts/simulate.js trace <night> <runIndex>` prints the event log of one run.
if (process.argv[2] === 'trace') {
  const night = Number(process.argv[3]) || 1;
  const i = Number(process.argv[4]) || 0;
  const orig = NightSession.prototype.emit;
  NightSession.prototype.emit = function (type, p = {}) {
    if (!['hour', 'light', 'monitor', 'camSwitch'].includes(type)) {
      const o = this.office;
      const info = { ...p, anim: p.anim?.id };
      console.log(`${this.time.toFixed(1).padStart(6)} ${type.padEnd(14)} ${JSON.stringify(info)}  [L:${o.left.closed ? 'X' : '_'} R:${o.right.closed ? 'X' : '_'} mon:${o.monitorUp ? 'up' : '--'} pwr:${this.power.toFixed(0)}]`);
    }
    return orig.call(this, type, p);
  };
  console.log(runNight(night, 1000 + i * 7919 + night));
  process.exit(0);
}

console.log(`Simulating ${RUNS} nights per level (bot player, ${NIGHT_SECONDS}s nights)\n`);
for (let n = 1; n <= MAX_NIGHT; n++) {
  let wins = 0, powerSum = 0, outs = 0;
  const killers = {};
  const use = { door: 0, light: 0, mon: 0, t: 0 };
  let bangs = 0;
  for (let i = 0; i < RUNS; i++) {
    const res = runNight(n, 1000 + i * 7919 + n);
    for (const k in res.use) use[k] += res.use[k];
    bangs += res.bangs;
    if (res.won) { wins++; powerSum += res.power; }
    if (res.poweredOut) outs++;
    if (res.killer) killers[res.killer] = (killers[res.killer] || 0) + 1;
  }
  const kills = Object.entries(killers).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
  console.log(
    `Night ${n}: win ${(100 * wins / RUNS).toFixed(0).padStart(3)}%  ` +
    `avg power left ${(wins ? powerSum / wins : 0).toFixed(1).padStart(5)}%  ` +
    `power-outs ${String(outs).padStart(3)}  deaths ${kills.padEnd(28)} ` +
    `usage: doors ${(use.door / use.t).toFixed(2)} lights ${(use.light / use.t).toFixed(2)} monitor ${(use.mon / use.t).toFixed(2)} bangs/night ${(bangs / RUNS).toFixed(1)}`
  );
}
