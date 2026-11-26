// ---------------------------------------------------------------------------
// The start-of-night phone call: rings, picks up, then plays the night's
// script as typed subtitles with a synthesized voice. Driven by the game loop
// (update(dt)), so pausing the game pauses the call too. The night itself
// keeps running while the phone talks; the player can mute it at any time.
// ---------------------------------------------------------------------------
import { CALLS, lineDuration, isStageDirection } from '../story/calls.js';

const $ = (id) => document.getElementById(id);
const RINGS = 3;
const RING_GAP = 2.8;
const LINE_GAP = 0.55;

export class PhoneCall {
  /** @param {import('../main.js').Game} game */
  constructor(game) {
    this.game = game;
    this.active = false;
    this.el = $('call');
    $('callMute').addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.audio.click();
      this.mute();
    });
  }

  get audio() {
    return this.game.audio;
  }

  /** Queue the call for this night (no-op if there is no script). */
  start(night, delay = 2) {
    const call = CALLS[night];
    this.stop();
    if (!call) return;
    this.call = call;
    this.active = true;
    this.phase = 'wait';
    this.t = delay;
    this.rings = 0;
    this.i = -1;
    this.elapsed = 0;
  }

  update(dt) {
    if (!this.active) return;
    this.t -= dt;
    if (this.phase === 'talk') {
      this.elapsed += dt;
      this.renderLine();
    }
    if (this.t > 0) return;
    switch (this.phase) {
      case 'wait':
        this.phase = 'ring';
        this.show('ring');
        this.t = 0;
        break;
      case 'ring':
        if (this.rings < RINGS) {
          this.audio.phoneRing();
          this.rings++;
          this.t = RING_GAP;
        } else {
          this.audio.phonePickup();
          this.audio.startPhoneLine(this.call.voice);
          this.phase = 'talk';
          this.show('talk');
          this.nextLine();
        }
        break;
      case 'talk':
        this.nextLine();
        break;
      case 'end':
        this.hide();
        this.active = false;
        break;
    }
  }

  nextLine() {
    this.i++;
    const line = this.call.lines[this.i];
    if (!line) return this.hangUp();
    const dur = lineDuration(line);
    this.lineDur = dur;
    this.t = dur + LINE_GAP;
    this.lineT = 0;
    if (line.fx) this.audio.phoneFx(line.fx);
    if (!isStageDirection(line)) this.audio.phoneSpeak(dur, line.voice ?? this.call.voice);
    $('callWho').textContent = line.who ?? this.call.caller;
    const txt = $('callText');
    txt.classList.toggle('stage', isStageDirection(line));
    txt.textContent = '';
  }

  renderLine() {
    const line = this.call.lines[this.i];
    if (!line) return;
    const shown = this.lineDur + LINE_GAP - this.t;
    // Text finishes typing slightly before the voice does.
    const n = Math.min(line.text.length, Math.ceil((shown / (this.lineDur * 0.85)) * line.text.length));
    const txt = $('callText');
    const s = line.text.slice(0, Math.max(0, n));
    if (txt.textContent !== s) txt.textContent = s;
    const sec = Math.floor(this.elapsed);
    $('callTime').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }

  hangUp() {
    this.audio.phoneHangup();
    this.audio.stopPhone();
    this.phase = 'end';
    this.t = 1.4;
    this.el.classList.add('ended');
    $('callWho').textContent = 'CALL ENDED';
  }

  /** Player muted the call: cut it off immediately. */
  mute() {
    if (!this.active || this.phase === 'end') return;
    if (this.phase === 'talk') this.audio.phoneHangup();
    this.stop();
  }

  /** Silently end everything (night over, power out, menu...). */
  stop() {
    if (this.active) this.audio.stopPhone();
    this.active = false;
    this.phase = null;
    this.hide();
  }

  show(mode) {
    this.el.classList.remove('hidden', 'ended');
    this.el.classList.toggle('ringing', mode === 'ring');
    if (mode === 'ring') {
      $('callWho').textContent = 'INCOMING CALL';
      $('callText').textContent = this.call.caller;
      $('callText').classList.remove('stage');
      $('callTime').textContent = '';
    }
  }

  hide() {
    this.el?.classList.add('hidden');
  }
}
