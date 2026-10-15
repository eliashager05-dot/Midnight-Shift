// ---------------------------------------------------------------------------
// Base animatronic: a timer-driven state machine.
//
//   IDLE ──(opportunity roll succeeds)──> MOVING ──> ROAMING / APPROACHING
//   APPROACHING ──> MOVING ──> WAITING (at a door)
//   WAITING ──(door shut long enough)──> RETREATING ──> ROAMING
//   WAITING ──(door left open past linger time)──> ATTACKING
//
// Every `interval` seconds the animatronic gets a "movement opportunity": a d20
// is rolled against its current AI level (night base + hour bonus + behaviour
// modifiers). Movement always follows room links and briefly disrupts the
// cameras involved, so the player can follow what happened.
// ---------------------------------------------------------------------------
import { ROOMS, roomDistance } from '../world/map.js';
import { CHARACTERS, CONFIG } from '../config.js';

export const AIState = Object.freeze({
  IDLE: 'IDLE',
  ROAMING: 'ROAMING',
  MOVING: 'MOVING',
  APPROACHING: 'APPROACHING',
  WAITING: 'WAITING',
  ATTACKING: 'ATTACKING',
  RETREATING: 'RETREATING',
  CHARGING: 'CHARGING', // Runner only
});

export class Animatronic {
  /**
   * @param {import('../world/session.js').NightSession} session
   * @param {{id:string, home:string, allowed:string[], interval:number, retreatRooms:string[]}} def
   */
  constructor(session, def) {
    this.session = session;
    this.id = def.id;
    this.name = CHARACTERS[def.id].name;
    this.home = def.home;
    this.room = def.home;
    this.allowed = new Set(def.allowed);
    this.interval = def.interval;
    this.retreatRooms = def.retreatRooms;
    this.state = AIState.IDLE;
    this.timer = this.interval * this.rng.range(0.7, 1.3); // time to next movement opportunity
    this.moveTimer = 0;
    this.dest = null;
    this.doorTimer = 0; // linger time left at a door while it is open
    this.blockedTime = 0; // time spent facing a closed door
    this.retreatAfter = 0;
    this.pose = 0; // which camera "slot" to stand in for the current room
    this.hidden = false; // standing in deep shadow (barely visible on camera)
    this.lastRoll = 0;
    this.lastBonus = 0;
    this.moves = 0;
  }

  get rng() {
    return this.session.rng;
  }

  /** Current effective AI level 0..20 */
  get level() {
    return this.session.levelFor(this.id);
  }

  get side() {
    return ROOMS[this.room]?.door ?? null;
  }

  /** Whether the character can currently be seen on a camera feed */
  get onCamera() {
    return this.state !== AIState.MOVING && this.state !== AIState.RETREATING && !!ROOMS[this.room].cam;
  }

  get inTransit() {
    return this.state === AIState.MOVING || this.state === AIState.RETREATING;
  }

  update(dt) {
    switch (this.state) {
      case AIState.MOVING:
      case AIState.RETREATING:
        this.moveTimer -= dt;
        if (this.moveTimer <= 0) this.arrive();
        break;
      case AIState.WAITING:
        this.updateWaiting(dt);
        break;
      case AIState.ATTACKING:
        break;
      default:
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = this.interval * this.rng.range(0.85, 1.15);
          this.opportunity();
        }
    }
  }

  /** Roll the d20 against level + bonus. */
  roll(bonus = 0) {
    const lvl = this.level;
    if (lvl <= 0) return false;
    this.lastRoll = this.rng.d20();
    this.lastBonus = bonus;
    return this.lastRoll <= lvl + bonus;
  }

  canMove() {
    return true;
  }

  moveBonus() {
    return this.session.flankBonus(this);
  }

  opportunity() {
    if (!this.canMove()) return;
    if (this.roll(this.moveBonus())) this.advance();
  }

  /** The door room this character is currently heading for. */
  target() {
    return this.targetRoom;
  }

  advance() {
    const next = this.chooseNext();
    if (next) this.moveTo(next);
  }

  /**
   * Weighted choice of the next room: mostly towards the target door, sometimes
   * sideways or backwards so patterns are not perfectly predictable.
   */
  chooseNext() {
    const target = this.target();
    const here = roomDistance(this.room, target, this.allowed);
    const options = [];
    for (const n of ROOMS[this.room].links) {
      if (!this.allowed.has(n) || this.session.isDoorRoomOccupied(n, this)) continue;
      const d = roomDistance(n, target, this.allowed);
      let weight = d < here ? 7 : d === here ? 2 : 1;
      if (n === this.home) weight *= 0.5;
      options.push({ value: n, weight });
    }
    return this.rng.weighted(options);
  }

  moveTo(room, { duration, retreat = false } = {}) {
    if (this.session.isDoorRoomOccupied(room, this)) return false;
    const from = this.room;
    this.state = retreat ? AIState.RETREATING : AIState.MOVING;
    this.dest = room;
    this.moveTimer = duration ?? this.rng.range(0.9, 1.6);
    this.hidden = false;
    const pad = CONFIG.moveDisruptPadding;
    this.session.disruptCam(from, this.moveTimer + pad);
    this.session.disruptCam(room, this.moveTimer + pad);
    this.moves++;
    this.session.emit('move', { anim: this, from, to: room, retreat });
    return true;
  }

  arrive() {
    const prev = this.room;
    this.room = this.dest;
    this.dest = null;
    this.pose = this.rng.int(0, 3);
    const info = ROOMS[this.room];
    if (info.door) {
      this.state = AIState.WAITING;
      this.onArriveDoor();
    } else {
      if (this.room === this.home) this.state = AIState.IDLE;
      else if (info.links.some((l) => ROOMS[l].door)) this.state = AIState.APPROACHING;
      else this.state = AIState.ROAMING;
      this.onArriveRoom(prev);
    }
    this.session.emit('arrive', { anim: this, room: this.room, from: prev });
  }

  onArriveRoom() {}

  onArriveDoor() {
    this.doorTimer = this.lingerTime() * this.rng.range(0.85, 1.2);
    this.blockedTime = 0;
    this.retreatAfter = this.rng.range(2, 3.5);
    this.revealed = false;
    this.session.emit('atDoor', { anim: this, side: this.side });
  }

  lingerTime() {
    return this.session.cfg.linger;
  }

  /** Waiting outside the office. A closed door eventually drives them away. */
  updateWaiting(dt) {
    if (this.session.doorClosed(this.side)) {
      this.blockedTime += dt;
      if (this.blockedTime >= this.retreatAfter) this.retreat();
      return;
    }
    this.doorTimer -= dt;
    if (this.doorTimer <= 0) this.enterOffice();
  }

  retreat() {
    const side = this.side;
    const dest = this.rng.pick(this.retreatRooms);
    this.session.emit('retreat', { anim: this, side });
    // Retreating skips intermediate rooms (they walk back through the hall).
    this.moveTo(dest, { retreat: true, duration: this.rng.range(1.2, 2.0) });
    this.timer = this.interval * this.rng.range(1.0, 1.6);
  }

  enterOffice() {
    this.state = AIState.ATTACKING;
    this.session.triggerAttack(this);
  }

  /** Debug snapshot */
  debugInfo() {
    return {
      id: this.id,
      state: this.state,
      room: this.dest ? `${this.room}->${this.dest}` : this.room,
      level: this.level,
      timer: this.timer.toFixed(1),
      roll: this.lastRoll ? `${this.lastRoll}${this.lastBonus ? '+' + this.lastBonus : ''}` : '-',
      extra: this.extraDebug ? this.extraDebug() : '',
    };
  }
}
