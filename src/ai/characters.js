// ---------------------------------------------------------------------------
// The four animatronics. Each one overrides parts of the base state machine to
// give it a distinct threat profile.
// ---------------------------------------------------------------------------
import { Animatronic, AIState } from './animatronic.js';
import { ROOMS } from '../world/map.js';

// ── MORTIMER THE BEAR ──────────────────────────────────────────────────────
// Slow and strategic. Never moves while you are watching his room on camera,
// likes to lurk in shadows (can vanish from view), laughs as he moves - but the
// laugh is sometimes thrown to the wrong side. Can take either door. While he is
// at an open door he slips in if you keep staring at the monitor.
export class Bear extends Animatronic {
  constructor(session) {
    super(session, {
      id: 'bear',
      home: 'STAGE',
      allowed: ['STAGE', 'DINING', 'WEST', 'EAST', 'KITCHEN', 'SERVICE', 'LDOOR', 'RDOOR'],
      interval: 5.2,
      retreatRooms: ['DINING'],
    });
    this.targetRoom = this.rng.chance(0.6) ? 'RDOOR' : 'LDOOR';
    this.sneak = 0;
  }

  canMove() {
    // He freezes while observed.
    return !this.session.isWatching(this.room);
  }

  moveBonus() {
    // Grows more aggressive as the night wears on.
    return super.moveBonus() + Math.floor(this.session.hour / 2);
  }

  advance() {
    if (this.room === 'STAGE' || this.room === 'DINING') {
      // Re-decide which door to stalk; keeps him unpredictable.
      if (this.rng.chance(0.35)) this.targetRoom = this.rng.chance(0.55) ? 'RDOOR' : 'LDOOR';
    }
    super.advance();
  }

  moveTo(room, opts) {
    const ok = super.moveTo(room, opts);
    if (ok) {
      const real = ROOMS[room].pan;
      const misleading = this.rng.chance(0.3);
      this.session.emit('bearLaugh', { pan: misleading ? -real || this.rng.pick([-0.8, 0.8]) : real, depth: ROOMS[room].depth, misleading });
    }
    return ok;
  }

  onArriveRoom() {
    // Lurks in the dark - sometimes only his eyes give him away, sometimes nothing.
    this.hidden = this.room !== 'STAGE' && this.rng.chance(0.45);
  }

  onArriveDoor() {
    super.onArriveDoor();
    this.sneak = 0;
    this.retreatAfter = this.rng.range(4, 7);
  }

  lingerTime() {
    return this.session.cfg.bearLinger;
  }

  updateWaiting(dt) {
    if (this.session.doorClosed(this.side)) {
      this.sneak = Math.max(0, this.sneak - dt);
      this.blockedTime += dt;
      if (this.blockedTime >= this.retreatAfter) this.retreat();
      return;
    }
    if (this.session.office.monitorUp) {
      // Staring at the cameras while he is at your door is a fatal mistake.
      this.sneak += dt;
      if (this.sneak >= 3.2) return this.enterOffice();
    }
    this.doorTimer -= dt;
    if (this.doorTimer <= 0) this.enterOffice();
  }

  extraDebug() {
    return `target=${this.targetRoom} hidden=${this.hidden} sneak=${this.sneak.toFixed(1)}`;
  }
}

// ── HOPSCOTCH THE RABBIT ───────────────────────────────────────────────────
// Fast, restless, west side only. Gets bolder the longer you go without
// checking the cameras.
export class Rabbit extends Animatronic {
  constructor(session) {
    super(session, {
      id: 'rabbit',
      home: 'STAGE',
      allowed: ['STAGE', 'BACKSTAGE', 'DINING', 'WEST', 'LDOOR'],
      interval: 4.8,
      retreatRooms: ['DINING', 'BACKSTAGE'],
    });
    this.targetRoom = 'LDOOR';
  }

  moveBonus() {
    const neglect = this.session.stats.timeSinceCams;
    return super.moveBonus() + (neglect > 25 ? 4 : neglect > 15 ? 2 : 0);
  }

  extraDebug() {
    return `neglect=${this.session.stats.timeSinceCams.toFixed(0)}s`;
  }
}

// ── PIPPA THE PARROT ───────────────────────────────────────────────────────
// Works the dining room, kitchen and service corridor, then comes up the east
// hall. Noisy in the kitchen, knocks cameras offline, and loves to surprise you
// by sticking her face right into the lens.
export class Bird extends Animatronic {
  constructor(session) {
    super(session, {
      id: 'bird',
      home: 'STAGE',
      allowed: ['STAGE', 'DINING', 'KITCHEN', 'SERVICE', 'EAST', 'RDOOR'],
      interval: 5.0,
      retreatRooms: ['DINING', 'KITCHEN'],
    });
    this.targetRoom = 'RDOOR';
    this.peekPending = false;
    this.watchTime = 0;
  }

  onArriveRoom() {
    this.peekPending = ['DINING', 'SERVICE', 'EAST', 'KITCHEN'].includes(this.room) && this.rng.chance(0.4);
    this.watchTime = 0;
  }

  opportunity() {
    super.opportunity();
    if (this.inTransit || this.state === AIState.WAITING) return;
    // Distractions while she rummages around.
    if (this.room === 'KITCHEN' && this.rng.chance(0.45)) this.session.emit('clatter', { room: 'KITCHEN' });
    if ((this.room === 'KITCHEN' || this.room === 'SERVICE') && this.level > 0 && this.rng.chance(0.12)) {
      const cams = ['STAGE', 'DINING', 'EAST', 'SERVICE', 'KITCHEN'].filter((c) => c !== this.room);
      this.session.setCamOffline(this.rng.pick(cams), this.rng.range(4, 7));
    }
  }

  update(dt) {
    super.update(dt);
    if (this.peekPending && !this.inTransit && this.session.isWatching(this.room)) {
      this.watchTime += dt;
      if (this.watchTime > 0.7) {
        this.peekPending = false;
        this.session.lensPeek(this.room, this.id);
      }
    }
  }
}

// ── SCRAPS THE HOUND ──────────────────────────────────────────────────────
// Lives behind the curtain in Storage. Stages 0-3: hidden, peeking, leaning
// out, gone. Watching CAM 06 freezes him; ignoring him makes him advance much
// faster. Once he breaks out he sprints down the west hall to the left door -
// you hear his collar jingle and his feet pound. A shut door makes him bang on
// it (costing power); an open door is fatal.
export class Runner extends Animatronic {
  constructor(session) {
    super(session, {
      id: 'runner',
      home: 'STORAGE',
      allowed: ['STORAGE', 'WEST', 'LDOOR'],
      interval: 5.0,
      retreatRooms: ['STORAGE'],
    });
    this.stage = 0;
    this.chargeTimer = 0;
    this.chargeTotal = 1;
    this.lastSeen = 0; // seconds since the player last looked at Storage
    this.bangs = 0;
  }

  get onCamera() {
    return this.state === AIState.CHARGING ? this.room === 'WEST' : this.room === 'STORAGE';
  }

  update(dt) {
    if (this.session.isWatching('STORAGE') && this.state !== AIState.CHARGING) {
      // Being checked on rattles him: the next opportunity is pushed back...
      if (this.lastSeen > 2) {
        this.timer = Math.max(this.timer, this.interval * this.rng.range(0.9, 1.6));
        this.watched = 0;
      }
      // ...and holding the camera on him for a moment can drive him back behind the curtain.
      this.watched = (this.watched ?? 0) + dt;
      if (this.watched >= 2 && this.watched - dt < 2 && this.stage > 0 && this.rng.chance(0.55)) {
        this.stage--;
        this.state = this.stage ? AIState.ROAMING : AIState.IDLE;
        this.session.emit('runnerRetreat', { stage: this.stage });
      }
      this.lastSeen = 0;
    } else this.lastSeen += dt;

    if (this.state === AIState.CHARGING) {
      // Looking at him mid-sprint only makes him faster.
      if (this.session.isWatching('WEST')) this.chargeTimer = Math.min(this.chargeTimer, 1.8);
      this.chargeTimer -= dt;
      if (this.chargeTimer <= 0) this.hitDoor();
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval * this.rng.range(0.85, 1.15);
      this.opportunity();
    }
  }

  opportunity() {
    if (this.session.isWatching('STORAGE')) return; // frozen under observation
    const ignored = this.lastSeen > this.session.cfg.runnerIgnore;
    if (!this.roll(ignored ? 6 : 0)) return;
    this.stage++;
    this.pose = this.rng.int(0, 1);
    this.state = this.stage > 0 ? AIState.ROAMING : AIState.IDLE;
    this.session.emit('runnerStir', { stage: this.stage });
    if (this.stage >= 3) this.startCharge();
  }

  startCharge() {
    this.state = AIState.CHARGING;
    this.room = 'WEST';
    this.chargeTotal = this.chargeTimer = this.session.cfg.runnerCharge * this.rng.range(0.95, 1.1);
    this.session.disruptCam('STORAGE', 0.6);
    this.session.emit('runnerSprint', { duration: this.chargeTimer });
  }

  /** 0..1 progress of the sprint down the west hall */
  get chargeProgress() {
    return this.state === AIState.CHARGING ? 1 - this.chargeTimer / this.chargeTotal : 0;
  }

  hitDoor() {
    this.room = 'LDOOR';
    if (this.session.doorClosed('left')) {
      this.bangs++;
      const penalty = Math.min(5, 1 + this.bangs);
      this.session.drainPower(penalty);
      this.session.emit('doorBang', { side: 'left', penalty });
      this.room = 'STORAGE';
      this.stage = this.rng.int(0, 1);
      this.state = this.stage ? AIState.ROAMING : AIState.IDLE;
      this.timer = this.interval * this.rng.range(1.5, 2.5);
      this.lastSeen = 0;
    } else {
      this.enterOffice();
    }
  }

  extraDebug() {
    return `stage=${this.stage} unseen=${this.lastSeen.toFixed(0)}s bangs=${this.bangs}${this.state === AIState.CHARGING ? ' charge=' + this.chargeTimer.toFixed(1) : ''}`;
  }
}
