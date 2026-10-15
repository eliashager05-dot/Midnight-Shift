// ---------------------------------------------------------------------------
// NightSession: the complete simulation of one night - clock, power, office
// controls, cameras, animatronic AI and the power-out sequence.
//
// It has no DOM / audio / canvas dependencies; everything observable is
// published through events. That keeps it testable headlessly
// (see scripts/simulate.js) and lets audio/UI subscribe independently.
// ---------------------------------------------------------------------------
import { CONFIG, getNightConfig } from '../config.js';
import { Emitter } from '../core/emitter.js';
import { createRng } from '../core/rng.js';
import { ROOMS, DOOR_ROOM } from './map.js';
import { Bear, Rabbit, Bird, Runner } from '../ai/characters.js';
import { AIState } from '../ai/animatronic.js';

export class NightSession extends Emitter {
  /**
   * @param {{night:number, nightSeconds?:number, seed?:number, frozen?:boolean}} opts
   */
  constructor({ night, nightSeconds = CONFIG.defaultNightMinutes * 60, seed, frozen = false }) {
    super();
    this.night = night;
    this.cfg = getNightConfig(night);
    this.rng = createRng(seed);
    this.nightSeconds = nightSeconds;
    this.time = 0;
    this.hour = 0;
    this.power = 100;
    this.usage = 1;
    this.state = 'running'; // running | powerout | won | lost
    this.frozen = frozen; // tutorial: clock, power and AI are halted
    this.killer = null;
    this.pendingAttack = null;

    this.office = {
      left: { closed: false, light: false, anim: 0 },
      right: { closed: false, light: false, anim: 0 },
      monitorUp: false,
      cam: 'STAGE',
    };
    this.camDisrupt = {}; // room -> seconds of movement interference left
    this.camOffline = {}; // room -> seconds the feed is dead
    this.peek = null; // {room, id, t}
    this.stats = { timeSinceCams: 0, closedTime: { left: 0, right: 0 }, camSwitches: 0, doorUses: 0 };
    this.powerOut = null;

    this.animatronics = [new Bear(this), new Rabbit(this), new Bird(this), new Runner(this)];
    this.byId = Object.fromEntries(this.animatronics.map((a) => [a.id, a]));
  }

  // ── Derived values ───────────────────────────────────────────────────────

  get displayHour() {
    return this.hour === 0 ? 12 : this.hour;
  }

  /** Fraction 0..1 of the night elapsed */
  get progress() {
    return Math.min(1, this.time / this.nightSeconds);
  }

  get ended() {
    return this.state === 'won' || this.state === 'lost';
  }

  levelFor(id) {
    let lvl = this.cfg.ai[id] ?? 0;
    for (let h = 1; h <= this.hour; h++) lvl += this.cfg.hourBonus[h]?.[id] ?? 0;
    return Math.max(0, Math.min(20, lvl));
  }

  /** % per second currently being drained */
  get drainRate() {
    const p = CONFIG.power;
    const lengthScale = p.referenceNightSeconds / this.nightSeconds;
    return p.unitDrainPerSec * lengthScale * this.cfg.drainMult * this.usage;
  }

  computeUsage() {
    const o = this.office;
    if (this.state === 'powerout') return 0;
    return 1 + (o.left.closed ? 1 : 0) + (o.right.closed ? 1 : 0) + (o.left.light ? 1 : 0) + (o.right.light ? 1 : 0) + (o.monitorUp ? 1 : 0);
  }

  doorClosed(side) {
    return this.office[side]?.closed === true;
  }

  isWatching(room) {
    return this.office.monitorUp && this.office.cam === room && this.state === 'running';
  }

  /** Animatronics visible (not in transit) in a room. */
  occupants(room) {
    return this.animatronics.filter((a) => a.room === room && !a.inTransit);
  }

  /** Who is standing at a door (for hallway light reveals). */
  atDoor(side) {
    const room = DOOR_ROOM[side];
    return this.animatronics.find((a) => a.room === room && a.state === AIState.WAITING) ?? null;
  }

  isDoorRoomOccupied(room, except) {
    if (!ROOMS[room]?.door) return false;
    return this.animatronics.some((a) => a !== except && (a.room === room || a.dest === room) && a.state !== AIState.CHARGING);
  }

  /**
   * Coordination: from night 3 on, keeping one door shut for a long time makes
   * the animatronics on the *other* side bolder.
   */
  flankBonus(anim) {
    if (!this.cfg.flank) return 0;
    const leftSide = anim.id === 'rabbit' || (anim.id === 'bear' && anim.targetRoom === 'LDOOR');
    const otherClosed = leftSide ? this.stats.closedTime.right : this.stats.closedTime.left;
    return otherClosed > 10 ? 2 : 0;
  }

  // ── Player actions ───────────────────────────────────────────────────────

  canUseControls() {
    return !this.ended && this.state !== 'powerout';
  }

  toggleDoor(side) {
    if (!this.canUseControls()) {
      this.emit('controlDead', { side, kind: 'door' });
      return false;
    }
    const d = this.office[side];
    d.closed = !d.closed;
    this.stats.doorUses++;
    this.emit('door', { side, closed: d.closed });
    this.usage = this.computeUsage();
    return true;
  }

  toggleLight(side) {
    if (!this.canUseControls()) {
      this.emit('controlDead', { side, kind: 'light' });
      return false;
    }
    const d = this.office[side];
    d.light = !d.light;
    this.emit('light', { side, on: d.light });
    if (d.light) this.checkReveal(side);
    this.usage = this.computeUsage();
    return true;
  }

  setLight(side, on) {
    if (this.office[side].light !== on) this.toggleLight(side);
  }

  setMonitor(up) {
    if (up && !this.canUseControls()) return false;
    if (this.office.monitorUp === up) return true;
    this.office.monitorUp = up;
    if (up) this.stats.timeSinceCams = 0;
    this.emit('monitor', { up });
    this.usage = this.computeUsage();
    return true;
  }

  switchCam(room) {
    if (!ROOMS[room]?.cam || this.office.cam === room) return;
    this.office.cam = room;
    this.stats.camSwitches++;
    this.emit('camSwitch', { room });
  }

  // ── Effects triggered by AI ──────────────────────────────────────────────

  disruptCam(room, seconds) {
    if (!ROOMS[room]?.cam) return;
    this.camDisrupt[room] = Math.max(this.camDisrupt[room] ?? 0, seconds);
  }

  setCamOffline(room, seconds) {
    this.camOffline[room] = Math.max(this.camOffline[room] ?? 0, seconds);
    this.emit('camOffline', { room, seconds });
  }

  lensPeek(room, id) {
    this.peek = { room, id, t: 1.1 };
    this.emit('lensPeek', { room, id });
  }

  drainPower(amount) {
    if (this.state !== 'running') return;
    this.power = Math.max(0, this.power - amount);
  }

  checkReveal(side) {
    const a = this.atDoor(side);
    if (a && !a.revealed) {
      a.revealed = true;
      this.emit('lightReveal', { side, id: a.id });
    }
  }

  /**
   * An animatronic got into the office. If the player is looking at the
   * monitor they get a moment of false safety: it strikes as soon as the
   * monitor comes down (or is ripped down after a few seconds).
   */
  triggerAttack(anim) {
    if (this.pendingAttack || this.ended) return;
    const viaMonitor = this.office.monitorUp;
    this.pendingAttack = { id: anim.id, t: viaMonitor ? this.rng.range(2.0, 3.5) : 0.25, viaMonitor };
    this.emit('enteredOffice', { id: anim.id, viaMonitor });
  }

  // ── Main update ──────────────────────────────────────────────────────────

  update(dt) {
    if (this.ended) return;
    const o = this.office;

    // Door shutter animation runs even while frozen.
    for (const side of ['left', 'right']) {
      const d = o[side];
      const target = d.closed ? 1 : 0;
      const step = dt / CONFIG.doorAnimTime;
      d.anim = d.anim < target ? Math.min(target, d.anim + step) : Math.max(target, d.anim - step);
    }
    if (this.frozen) return;

    // Clock
    this.time += dt;
    const hour = Math.min(6, Math.floor((this.time / this.nightSeconds) * CONFIG.hoursPerNight));
    if (hour !== this.hour) {
      this.hour = hour;
      this.emit('hour', { hour });
    }
    if (this.time >= this.nightSeconds) return this.win();

    // Timers
    for (const k in this.camDisrupt) if ((this.camDisrupt[k] -= dt) <= 0) delete this.camDisrupt[k];
    for (const k in this.camOffline) if ((this.camOffline[k] -= dt) <= 0) delete this.camOffline[k];
    if (this.peek && (this.peek.t -= dt) <= 0) this.peek = null;

    this.stats.timeSinceCams = o.monitorUp ? 0 : this.stats.timeSinceCams + dt;
    for (const side of ['left', 'right']) {
      this.stats.closedTime[side] = o[side].closed ? this.stats.closedTime[side] + dt : 0;
    }

    if (this.state === 'powerout') return this.updatePowerOut(dt);

    // Power
    this.usage = this.computeUsage();
    this.power -= this.drainRate * dt;
    if (this.power <= 0) return this.startPowerOut();

    // Hallway lights reveal whoever arrives while they are on.
    if (o.left.light) this.checkReveal('left');
    if (o.right.light) this.checkReveal('right');

    for (const a of this.animatronics) a.update(dt);

    if (this.pendingAttack) {
      const pa = this.pendingAttack;
      if (!o.monitorUp) {
        pa.t = Math.min(pa.t, pa.viaMonitor ? 0.1 : pa.t);
      }
      pa.t -= dt;
      if (pa.t <= 0) {
        if (o.monitorUp) {
          o.monitorUp = false;
          this.emit('forceMonitorDown', {});
        }
        this.lose(pa.id);
      }
    }
  }

  // ── Power failure ────────────────────────────────────────────────────────

  startPowerOut() {
    this.power = 0;
    this.state = 'powerout';
    const o = this.office;
    for (const side of ['left', 'right']) {
      o[side].closed = false;
      o[side].light = false;
    }
    if (o.monitorUp) {
      o.monitorUp = false;
      this.emit('forceMonitorDown', {});
    }
    this.usage = 0;
    this.pendingAttack = null;
    // Darker nights give you less time in the dark.
    const scale = 1.15 - this.night * 0.07;
    this.powerOut = { phase: 'dark', t: this.rng.range(7, 16) * scale };
    this.emit('powerOut', {});
  }

  updatePowerOut(dt) {
    const po = this.powerOut;
    po.t -= dt;
    if (po.t > 0) return;
    if (po.phase === 'dark') {
      po.phase = 'music';
      po.t = this.rng.range(7, 17);
      this.emit('powerOutMusic', {});
    } else if (po.phase === 'music') {
      po.phase = 'silent';
      po.t = this.rng.range(2, 4.5);
      this.emit('powerOutSilent', {});
    } else {
      this.lose('bear');
    }
  }

  // ── Endings ──────────────────────────────────────────────────────────────

  win() {
    this.state = 'won';
    this.time = this.nightSeconds;
    this.hour = 6;
    this.emit('win', { night: this.night });
  }

  lose(id) {
    if (this.ended) return;
    this.state = 'lost';
    this.killer = id;
    this.emit('jumpscare', { id });
  }

  // ── Debug helpers ────────────────────────────────────────────────────────

  debugSkipHour() {
    const perHour = this.nightSeconds / CONFIG.hoursPerNight;
    this.time = Math.min(this.nightSeconds - 0.5, (Math.floor(this.time / perHour) + 1) * perHour);
  }
}
