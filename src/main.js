// ---------------------------------------------------------------------------
// MIDNIGHT SHIFT - game controller.
// Owns the screen state machine, the main loop, input handling and the wiring
// between the simulation (NightSession), renderers, audio and UI.
// ---------------------------------------------------------------------------
import { CONFIG, VIEW_W, VIEW_H, MAX_NIGHT, CUSTOM_NIGHT, getNightConfig, normalizeCustom } from './config.js';
import { loadSave, writeSave, recordNightComplete, recordCustomWin, resetProgress } from './core/save.js';
import { NightSession } from './world/session.js';
import { ROOMS, CAMERA_ROOMS } from './world/map.js';
import { AIState } from './ai/animatronic.js';
import { Effects } from './render/effects.js';
import { OfficeView } from './render/office.js';
import { CameraView } from './render/cameraView.js';
import { Jumpscare } from './render/jumpscare.js';
import { MenuBackdrop, GameOverBackdrop, DawnBackdrop } from './render/backdrops.js';
import { AudioEngine } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { Tutorial } from './ui/tutorial.js';
import { PhoneCall } from './ui/phone.js';

const $ = (id) => document.getElementById(id);
const MENU_SCREENS = ['menu', 'nightSelect', 'custom', 'settings', 'splash'];

export class Game {
  constructor() {
    this.canvas = $('game');
    this.ctx = this.canvas.getContext('2d');
    this.camCtx = $('cam').getContext('2d');
    this.stage = $('stage');

    this.params = new URLSearchParams(location.search);
    this.save = loadSave();
    if (this.params.get('debug') === '1') this.save.settings.debug = true;
    const seed = Number(this.params.get('seed'));
    this.fixedSeed = Number.isFinite(seed) && this.params.has('seed') ? seed : undefined;

    this.fx = new Effects();
    this.fx.setLevel(this.save.settings.visualEffects);
    this.office = new OfficeView(this.fx);
    this.camView = new CameraView(this.fx);
    this.jumpscare = new Jumpscare(this.fx);
    this.menuBg = new MenuBackdrop(this.fx);
    this.goBg = new GameOverBackdrop(this.fx);
    this.dawnBg = new DawnBackdrop(this.fx);
    this.audio = new AudioEngine();
    this.audio.applySettings(this.save.settings);
    this.ui = new UI(this);
    this.tutorial = new Tutorial(this);
    this.phone = new PhoneCall(this);

    this.mode = 'splash'; // splash | menu | intro | playing | jumpscare | gameover | victory
    this.paused = false;
    this.session = null;
    this.night = 1;
    this.custom = null; // {ai, mods} while playing the Custom Night
    this.mouse = { x: null, y: null };
    this.t = 0;
    this.last = performance.now();
    this.fps = 60;
    this.dangerTimer = 0;
    this.monitorLockUntil = 0;

    this.bindInput();
    this.fitStage();
    window.addEventListener('resize', () => this.fitStage());
    document.addEventListener('fullscreenchange', () => this.fitStage());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing' && !this.paused) this.pause();
    });
    requestAnimationFrame((n) => this.frame(n));
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  fitStage() {
    const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    this.scale = s;
    this.stage.style.setProperty('--scale', String(s));
  }

  toStage(e) {
    const r = this.stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
  }

  // ── Screen flow ──────────────────────────────────────────────────────────

  onSplashClick() {
    if (this.mode !== 'splash') return;
    this.audio.unlock();
    this.audio.applySettings(this.save.settings);
    this.audio.click();
    this.audio.menuAmbience();
    this.ui.fade(() => this.toMenu(), 300);
  }

  toMenu() {
    this.endSession();
    this.paused = false;
    this.mode = 'menu';
    this.audio.stopAll(0.3);
    this.audio.menuAmbience();
    this.ui.setHud(false);
    this.ui.resetMonitor();
    this.ui.setDebug(null);
    this.ui.openMenu();
  }

  newGame() {
    this.startNight(1);
  }

  continueGame() {
    this.startNight(this.save.nextNight);
  }

  nextNight() {
    if (this.night === CUSTOM_NIGHT) {
      this.toMenu();
      return this.ui.openCustom();
    }
    this.startNight(Math.min(MAX_NIGHT, this.night + 1));
  }

  startCustomNight(setup) {
    this.startNight(CUSTOM_NIGHT, setup);
  }

  restartNight() {
    this.startNight(this.night, this.custom);
  }

  resetProgress() {
    this.save = resetProgress(this.save);
    this.ui.openMenu();
  }

  endSession() {
    this.audio.stopMusicBox();
    this.audio.stopLoop('gameover', 0.2);
    this.phone.stop();
    if (this.session) this.session = null;
    if (this.tutorial.active) {
      this.tutorial.active = false;
      this.tutorial.clearHighlights();
      $('tutorial').classList.add('hidden');
    }
  }

  /** Show the night card; the shift begins on click. */
  startNight(n, custom = null) {
    this.endSession();
    this.night = n;
    this.custom = n === CUSTOM_NIGHT ? normalizeCustom(custom) : null;
    this.paused = false;
    this.mode = 'intro';
    this.audio.stopAll(0.4);
    this.ui.setHud(false);
    this.ui.resetMonitor();
    const cfg = getNightConfig(n, this.custom);
    this.ui.fade(() => {
      this.ui.showIntro(n, cfg.memo);
      this.audio.tone({ type: 'sine', freq: 55, freqEnd: 40, dur: 2.5, gain: 0.2, a: 0.5, wet: 0.6 });
    }, 300);
    clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => this.mode === 'intro' && this.beginShift(), 12000);
  }

  beginShift() {
    if (this.mode !== 'intro') return;
    clearTimeout(this.introTimer);
    clearInterval(this.ui.typeTimer);
    const s = this.save.settings;
    const useTutorial = this.night === 1 && s.tutorial && !this.save.tutorialDone;
    const session = new NightSession({
      night: this.night,
      nightSeconds: s.nightMinutes * 60,
      seed: this.fixedSeed,
      frozen: useTutorial,
      custom: this.custom,
    });
    this.wireSession(session);
    this.session = session;
    this.office.viewX = (1920 - VIEW_W) / 2;
    this.panStart = this.office.viewX;
    this.ui.fade(() => {
      this.mode = 'playing';
      this.ui.hideAll();
      this.ui.setHud(true);
      this.ui.resetMonitor();
      this.audio.officeAmbience();
      if (useTutorial) this.tutorial.start();
      else this.startPhoneCall();
    }, 400);
  }

  /** Ring the desk phone with tonight's call (if enabled and there is one). */
  startPhoneCall() {
    if (this.save.settings.phoneCalls && this.session && !this.session.ended) this.phone.start(this.night);
  }

  onTutorialDone(skipped) {
    this.save.tutorialDone = true;
    writeSave(this.save);
    if (this.session) this.session.frozen = false;
    if (!skipped) this.audio.sting(0.12);
    this.startPhoneCall();
  }

  pause() {
    if (this.mode !== 'playing' || this.paused) return;
    this.paused = true;
    this.ui.show('pause');
    this.ui.hideTooltip();
    this.audio.ctx?.suspend();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.ui.hideAll();
    this.audio.ctx?.resume();
    this.last = performance.now();
  }

  togglePause() {
    if (this.paused) {
      if (this.ui.current === 'settings') this.ui.show('pause');
      else this.resume();
    } else this.pause();
  }

  // ── Session wiring: simulation events -> audio / visuals ─────────────────

  wireSession(s) {
    const A = this.audio;
    const sidePan = (side) => (side === 'left' ? -0.85 : 0.85);
    const watching = (room) => s.office.monitorUp && s.office.cam === room;

    s.on('door', ({ side, closed }) => {
      A.doorSlam(sidePan(side), closed);
      this.tutorial.notify('door');
    });
    s.on('light', ({ side, on }) => {
      A.lightOn(side, on);
      this.tutorial.notify('light');
    });
    s.on('controlDead', ({ side }) => A.deadButton(sidePan(side)));
    s.on('monitor', ({ up }) => {
      this.ui.setMonitor(up);
      A.monitor(up);
      A.setFanLevel(up ? 0.35 : 1);
      this.tutorial.notify(up ? 'monitorUp' : 'monitorDown');
    });
    s.on('forceMonitorDown', () => {
      this.ui.setMonitor(false);
      A.monitor(false);
    });
    s.on('camSwitch', () => {
      this.camView.onSwitch();
      A.camSwitch();
      this.tutorial.notify('camSwitch');
    });
    s.on('move', ({ anim, from, to, retreat }) => {
      const info = ROOMS[to];
      const gain = 0.03 + info.depth * 0.17;
      if (watching(from) || watching(to)) {
        this.camView.interfere(0.5);
        A.interference();
      }
      if (anim.id === 'bear') A.footsteps({ pan: info.pan, gain: gain * 0.6, count: 2, interval: 0.7, heavy: true, wet: 0.6 });
      else if (anim.id === 'bird') {
        A.footsteps({ pan: info.pan, gain, count: 3, interval: 0.35 });
        if (Math.random() < 0.3) A.birdScreech(info.pan, gain * 0.4);
      } else if (anim.id === 'rabbit') {
        A.footsteps({ pan: info.pan, gain, count: 3, interval: 0.42 });
        if (Math.random() < 0.35) A.servo(info.pan, gain * 0.5);
      }
      if (retreat) A.footsteps({ pan: info.pan, gain: 0.08, count: 4, interval: 0.4, wet: 0.7 });
    });
    s.on('bearLaugh', ({ pan, depth }) => A.bearLaugh(pan, 0.05 + depth * 0.18));
    s.on('atDoor', ({ anim, side }) => {
      const pan = sidePan(side);
      A.footsteps({ pan, gain: 0.32, count: 2, interval: 0.5, heavy: true, wet: 0.2 });
      setTimeout(() => {
        if (this.session !== s || s.ended || s.atDoor(side) !== anim) return;
        A.breathing(pan, 0.1);
        if (anim.id === 'rabbit') A.rabbitGroan(pan, 0.08);
        if (anim.id === 'bird') A.birdScreech(pan, 0.05);
      }, 1300);
    });
    s.on('retreat', ({ side }) => A.footsteps({ pan: sidePan(side), gain: 0.16, count: 4, interval: 0.45, wet: 0.5 }));
    s.on('lightReveal', () => {
      A.sting(0.22);
      this.office.triggerFlicker(0.25);
    });
    s.on('runnerStir', ({ stage }) => A.runnerStir(0.02 + stage * 0.03));
    s.on('runnerRetreat', () => {
      A.servo(-0.7, 0.04);
      this.camView.interfere(0.2);
    });
    s.on('runnerSprint', ({ duration }) => A.runnerSprint(duration));
    s.on('doorBang', () => {
      A.doorBang();
      this.ui.shake();
      this.office.triggerFlicker(0.5);
    });
    s.on('clatter', () => A.clatter(0.5));
    s.on('camOffline', ({ room }) => {
      if (watching(room)) A.interference();
    });
    s.on('lensPeek', () => {
      A.sting(0.3);
      A.birdScreech(0, 0.1);
      this.camView.interfere(0.4);
    });
    s.on('enteredOffice', () => A.servo(0, 0.02));
    s.on('powerOut', () => {
      this.phone.stop();
      A.powerDown();
      this.ui.setMonitor(false);
      this.ui.hideTooltip();
    });
    s.on('powerOutMusic', () => A.startMusicBox(-0.85));
    s.on('powerOutSilent', () => A.stopMusicBox());
    s.on('jumpscare', ({ id }) => this.onJumpscare(id));
    s.on('win', ({ night }) => this.onWin(night));
  }

  onJumpscare(id) {
    this.phone.stop();
    this.mode = 'jumpscare';
    this.ui.setHud(false);
    this.ui.resetMonitor();
    this.ui.hideTooltip();
    if (this.tutorial.active) this.tutorial.finish(true);
    const s = this.save.settings;
    this.jumpscare.start(id, { reducedFlashing: s.reducedFlashing, shake: s.screenShake });
    this.audio.jumpscare(id);
  }

  onWin(night) {
    this.mode = 'victory';
    this.victoryT = 0;
    this.ui.setHud(false);
    this.ui.resetMonitor();
    this.ui.hideTooltip();
    this.phone.stop();
    this.audio.victory();
    if (night === CUSTOM_NIGHT) return this.ui.showVictory(night, false, recordCustomWin(this.save, this.custom));
    const before = this.save.unlockedNight;
    this.save = recordNightComplete(this.save, night);
    this.ui.showVictory(night, this.save.unlockedNight > before);
  }

  // ── Player actions ───────────────────────────────────────────────────────

  get playing() {
    return this.mode === 'playing' && !this.paused && !!this.session;
  }

  toggleMonitor() {
    if (!this.playing) return;
    const s = this.session;
    const now = performance.now();
    if (now < this.monitorLockUntil) return;
    if (!s.office.monitorUp && !s.canUseControls()) return this.audio.deadButton();
    this.monitorLockUntil = now + CONFIG.monitorAnimTime * 1000 + 40;
    s.setMonitor(!s.office.monitorUp);
  }

  selectCam(room) {
    if (!this.playing || !this.session.office.monitorUp) return;
    this.session.switchCam(room);
  }

  /** Office controls are only usable while the monitor is fully down. */
  get officeInteractive() {
    return this.playing && !this.session.office.monitorUp && performance.now() >= this.monitorLockUntil && this.session.state !== 'lost';
  }

  officeAction(key) {
    const s = this.session;
    switch (key) {
      case 'leftDoor': return s.toggleDoor('left');
      case 'rightDoor': return s.toggleDoor('right');
      case 'leftLight': return s.toggleLight('left');
      case 'rightLight': return s.toggleLight('right');
      case 'plush':
        this.office.squeezePlush();
        this.audio.squeak();
        return true;
    }
  }

  tooltipFor(key) {
    const o = this.session.office;
    const dead = this.session.state === 'powerout';
    if (dead && key !== 'plush') return 'NO POWER';
    switch (key) {
      case 'leftDoor': return `LEFT DOOR - click to ${o.left.closed ? 'OPEN' : 'CLOSE'}  [Q]`;
      case 'rightDoor': return `RIGHT DOOR - click to ${o.right.closed ? 'OPEN' : 'CLOSE'}  [E]`;
      case 'leftLight': return `LEFT HALL LIGHT - ${o.left.light ? 'ON' : 'OFF'}  [A]`;
      case 'rightLight': return `RIGHT HALL LIGHT - ${o.right.light ? 'ON' : 'OFF'}  [D]`;
      case 'plush': return 'Mortimer plush (squeaky)';
    }
    return '';
  }

  updateSetting(key, value) {
    this.save.settings[key] = value;
    writeSave(this.save);
    this.audio.applySettings(this.save.settings);
    if (key === 'visualEffects') this.fx.setLevel(value);
    if (key === 'debug' && !value) this.ui.setDebug(null);
    if (key === 'phoneCalls' && !value) this.phone.stop();
  }

  toggleMute() {
    this.updateSetting('muted', !this.save.settings.muted);
    this.ui.fillSettings(this.save.settings);
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  // ── Input ────────────────────────────────────────────────────────────────

  bindInput() {
    this.stage.addEventListener('mousemove', (e) => {
      const p = this.toStage(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.updateHover();
    });
    this.stage.addEventListener('mouseleave', () => {
      this.mouse.x = null;
      this.office.hover = null;
      this.ui.hideTooltip();
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.officeInteractive || this.ui.confirmOpen) return;
      const p = this.toStage(e);
      const hit = this.office.hitTest(p.x + this.office.viewX, p.y);
      if (hit) {
        this.officeAction(hit.key);
        this.updateHover();
      }
    });

    window.addEventListener('keydown', (e) => {
      const tag = e.target?.tagName;
      const inForm = tag === 'INPUT' || tag === 'SELECT';
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.ui.confirmOpen) return this.ui.confirmOpen(false);
        if (this.mode === 'playing') return this.togglePause();
        if (['settings', 'nightSelect', 'custom'].includes(this.ui.current)) return this.ui.back();
        return;
      }
      if (inForm || e.repeat) return;
      if (k === 'f') return this.toggleFullscreen();
      if (k === 'm') return this.toggleMute();
      if (this.mode === 'splash' && (k === 'enter' || k === ' ')) return this.onSplashClick();
      if (this.mode === 'intro' && (k === 'enter' || k === ' ')) return this.beginShift();
      if (!this.playing) return;
      if (k === ' ') {
        e.preventDefault();
        return this.toggleMonitor();
      }
      if (k === 'h') return this.phone.mute();
      if (/^[1-8]$/.test(k) && this.session.office.monitorUp) return this.selectCam(CAMERA_ROOMS[Number(k) - 1]);
      if (this.officeInteractive) {
        const map = { q: 'leftDoor', e: 'rightDoor', a: 'leftLight', d: 'rightLight' };
        if (map[k]) return this.officeAction(map[k]);
      }
      if (this.save.settings.debug) this.debugKey(k);
    });
    this.keysDown = new Set();
    window.addEventListener('keydown', (e) => this.keysDown.add(e.key));
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.key));
  }

  updateHover() {
    if (!this.officeInteractive || this.mouse.x == null) {
      if (this.office.hover) {
        this.office.hover = null;
        this.ui.hideTooltip();
        this.canvas.style.cursor = '';
      }
      return;
    }
    const hit = this.office.hitTest(this.mouse.x + this.office.viewX, this.mouse.y);
    this.office.hover = hit?.key ?? null;
    this.canvas.style.cursor = hit ? 'pointer' : '';
    if (hit) this.ui.showTooltip(this.tooltipFor(hit.key), hit.x - this.office.viewX + hit.w / 2, hit.y);
    else this.ui.hideTooltip();
  }

  debugKey(k) {
    const s = this.session;
    if (k === ']') s.debugSkipHour();
    if (k === 'p') s.power = Math.min(s.power, 3);
    if (k === 'o') s.power = 100;
    if (k === 'v') s.time = s.nightSeconds - 0.2;
    if (k === 'k') s.lose('rabbit');
    if (k === 'r') {
      // force the runner to break out
      const r = s.byId.runner;
      if (r.state !== AIState.CHARGING) {
        r.stage = 2;
        r.timer = 0;
        r.roll = () => true;
        setTimeout(() => delete r.roll, 50);
      }
    }
  }

  // ── Main loop ────────────────────────────────────────────────────────────

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    try {
      this.update(dt);
      this.render(dt);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame((n) => this.frame(n));
  }

  update(dt) {
    if (!this.playing) return;
    const s = this.session;
    s.update(dt);
    if (this.mode !== 'playing') return; // night ended inside update
    this.phone.update(dt);
    // look around (mouse at edges / arrow keys)
    if (!s.office.monitorUp) {
      this.office.updatePan(dt, this.mouse.x, true);
      if (this.keysDown.has('ArrowLeft')) this.office.panBy(-900 * dt);
      if (this.keysDown.has('ArrowRight')) this.office.panBy(900 * dt);
      if (Math.abs(this.office.viewX - this.panStart) > 120) this.tutorial.notify('pan');
    }
    // tension bed when something is close
    this.dangerTimer -= dt;
    if (this.dangerTimer <= 0) {
      this.dangerTimer = 0.5;
      const near = s.state === 'running' ? s.animatronics.filter((a) => [AIState.APPROACHING, AIState.WAITING, AIState.CHARGING].includes(a.state)).length : 0;
      this.audio.setDanger(Math.min(1, near * 0.45));
    }
    this.ui.updateHud(s);
  }

  render(dt) {
    const ctx = this.ctx;
    const t = this.t;
    if (this.mode === 'splash') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      this.fx.static(ctx, t, 0.03);
    } else if (this.mode === 'menu' || MENU_SCREENS.includes(this.ui.current) && !this.session) {
      this.menuBg.render(ctx, t, dt);
      if (Math.random() < dt * 0.12) this.ui.glitchTitle();
    } else if (this.mode === 'intro') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      this.fx.grain(ctx, t, 0.15);
    } else if (this.mode === 'playing' && this.session) {
      const s = this.session;
      const monitorFull = s.office.monitorUp && $('monitor').classList.contains('ready');
      if (!monitorFull) this.office.render(ctx, s, t, this.paused ? 0 : dt);
      if (s.office.monitorUp || $('monitor').classList.contains('moving')) this.camView.render(this.camCtx, s, t, this.paused ? 0 : dt);
    } else if (this.mode === 'jumpscare') {
      const s = this.session;
      this.jumpscare.render(ctx, dt, (c) => this.office.render(c, s, t, 0));
      if (this.jumpscare.done) {
        this.mode = 'gameover';
        this.audio.defeat();
        this.ui.showGameOver(s.killer, s);
      }
    } else if (this.mode === 'gameover') {
      this.goBg.render(ctx, t, this.session?.killer);
    } else if (this.mode === 'victory') {
      this.victoryT += dt;
      this.dawnBg.render(ctx, this.victoryT);
    }

    if (this.save.settings.debug && this.session && (this.mode === 'playing' || this.mode === 'jumpscare')) this.ui.setDebug(this.debugText());
  }

  debugText() {
    const s = this.session;
    const lines = [
      `DEBUG  night ${s.night}  seed ${s.rng.seed}  fps ${this.fps.toFixed(0)}`,
      `clock  ${s.displayHour} AM  t=${s.time.toFixed(1)}/${s.nightSeconds}s  state=${s.state}${s.frozen ? ' (frozen: tutorial)' : ''}`,
      `power  ${s.power.toFixed(2)}%  usage=${s.usage}  drain=${s.drainRate.toFixed(3)}%/s`,
      `office L[door:${s.office.left.closed ? 'X' : '_'} light:${s.office.left.light ? 'o' : '_'}] R[door:${s.office.right.closed ? 'X' : '_'} light:${s.office.right.light ? 'o' : '_'}] monitor:${s.office.monitorUp ? s.office.cam : '-'}`,
      `player sinceCams=${s.stats.timeSinceCams.toFixed(0)}s closedL=${s.stats.closedTime.left.toFixed(0)}s closedR=${s.stats.closedTime.right.toFixed(0)}s`,
      s.pendingAttack ? `ATTACK PENDING: ${s.pendingAttack.id} in ${s.pendingAttack.t.toFixed(1)}s` : '',
      s.powerOut ? `power-out phase=${s.powerOut.phase} t=${s.powerOut.t.toFixed(1)}` : '',
      '',
      'id      state        room             lvl  next  roll  extra',
      ...s.animatronics.map((a) => {
        const d = a.debugInfo();
        return `${d.id.padEnd(7)} ${d.state.padEnd(12)} ${d.room.padEnd(16)} ${String(d.level).padStart(3)}  ${d.timer.padStart(4)}  ${d.roll.padEnd(5)} ${d.extra}`;
      }),
      '',
      'keys: ] next hour | P power 3% | O power 100% | V win | K die | R runner sprint',
    ];
    return lines.filter((l, i) => l !== '' || i > 6).join('\n');
  }
}

// Boot: wait (briefly) for web fonts so baked canvas text uses them.
async function boot() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('20px VT323'), document.fonts.load('20px "Special Elite"')]),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  } catch {
    /* offline: fall back to system fonts */
  }
  window.__game = new Game();
}
boot();
