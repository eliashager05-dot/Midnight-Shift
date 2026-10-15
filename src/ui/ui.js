// ---------------------------------------------------------------------------
// DOM user interface: screens/menus, HUD, camera map, settings form,
// confirmation dialog, tooltips and the debug overlay.
// ---------------------------------------------------------------------------
import { CAMERA_ROOMS, MAP_LAYOUT, ROOMS } from '../world/map.js';
import { MAX_NIGHT, MAIN_NIGHTS, CHARACTERS } from '../config.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['splash', 'menu', 'nightSelect', 'settings', 'intro', 'pause', 'gameover', 'victory'];

export class UI {
  /** @param {import('../main.js').Game} game */
  constructor(game) {
    this.game = game;
    this.current = 'splash';
    this.camButtons = {};
    this.buildCamMap();
    this.buildUsageBars();
    this.bindButtons();
    this.bindSettings();
    this.bindHoverSounds();
  }

  // ── Screens ──────────────────────────────────────────────────────────────

  show(name) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    this.current = name;
  }

  hideAll() {
    for (const s of SCREENS) $(s).classList.add('hidden');
    this.current = null;
  }

  isVisible(name) {
    return !$(name).classList.contains('hidden');
  }

  /** Black fade-out -> callback -> fade-in */
  fade(fn, ms = 450) {
    const f = $('fade');
    f.classList.add('on');
    setTimeout(() => {
      fn();
      requestAnimationFrame(() => f.classList.remove('on'));
    }, ms);
  }

  setHud(visible) {
    $('hud').classList.toggle('hidden', !visible);
    if (!visible) this.hideTooltip();
  }

  // ── Buttons ──────────────────────────────────────────────────────────────

  bindButtons() {
    const g = this.game;
    const on = (id, fn) => $(id).addEventListener('click', (e) => {
      e.stopPropagation();
      g.audio.click();
      fn(e);
    });
    $('splash').addEventListener('click', () => g.onSplashClick());
    on('btnNew', () => g.newGame());
    on('btnContinue', () => g.continueGame());
    on('btnNights', () => this.openNightSelect());
    on('btnSettings', () => this.openSettings('menu'));
    on('btnReset', async () => {
      if (await this.confirm('Erase all progress? Unlocked nights and completed nights will be lost. Settings are kept.')) g.resetProgress();
    });
    on('btnFullscreen', () => g.toggleFullscreen());
    on('btnResume', () => g.resume());
    on('btnRestart', async () => {
      if (await this.confirm('Restart this night from 12 AM?')) g.restartNight();
    });
    on('btnPauseSettings', () => this.openSettings('pause'));
    on('btnPauseMenu', async () => {
      if (await this.confirm('Quit to the main menu? Progress on this night will be lost.')) g.toMenu();
    });
    on('btnRetry', () => g.restartNight());
    on('btnGoMenu', () => g.toMenu());
    on('btnNextNight', () => g.nextNight());
    on('btnVMenu', () => g.toMenu());
    $('intro').addEventListener('click', () => g.beginShift());
    document.querySelectorAll('[data-back]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        g.audio.click();
        this.back();
      }),
    );
    $('camToggle').addEventListener('click', (e) => {
      e.stopPropagation();
      g.toggleMonitor();
    });
    $('camToggle').addEventListener('mouseenter', () => this.showTooltip($('camToggle').dataset.tip, 640, 610));
    $('camToggle').addEventListener('mouseleave', () => this.hideTooltip());
    $('tutNext').addEventListener('click', (e) => {
      e.stopPropagation();
      g.tutorial?.next();
    });
    $('tutSkip').addEventListener('click', (e) => {
      e.stopPropagation();
      g.tutorial?.finish(true);
    });
  }

  bindHoverSounds() {
    document.querySelectorAll('.btn, .cam-btn').forEach((b) => b.addEventListener('mouseenter', () => this.game.audio.uiHover()));
  }

  back() {
    if (this.returnTo === 'pause') this.show('pause');
    else this.openMenu();
  }

  // ── Menu ─────────────────────────────────────────────────────────────────

  openMenu() {
    const save = this.game.save;
    const cont = $('btnContinue');
    const canContinue = save.unlockedNight > 1 || save.completed.length > 0;
    cont.classList.toggle('hidden', !canContinue);
    $('continueNight').textContent = `- Night ${save.nextNight}`;
    $('btnReset').classList.toggle('hidden', !canContinue);
    // stars for completed nights
    const stars = [];
    if (save.completed.includes(MAIN_NIGHTS)) stars.push('★');
    if (save.completed.includes(MAX_NIGHT)) stars.push('★');
    $('menuStars').textContent = stars.join(' ');
    this.show('menu');
  }

  openNightSelect() {
    const save = this.game.save;
    const grid = $('nightGrid');
    grid.innerHTML = '';
    for (let n = 1; n <= MAX_NIGHT; n++) {
      const locked = n > save.unlockedNight;
      const card = document.createElement('button');
      card.className = `night-card${locked ? ' locked' : ''}${n === MAX_NIGHT ? ' challenge' : ''}`;
      const label = n === MAX_NIGHT ? (locked ? '???' : 'CHALLENGE') : 'NIGHT';
      card.innerHTML = `<span>${label}</span><span class="n">${locked && n === MAX_NIGHT ? '?' : n}</span><span class="s">${save.completed.includes(n) ? '★ SURVIVED' : locked ? 'LOCKED' : ''}</span>`;
      card.disabled = locked;
      card.title = locked ? 'Survive the previous night to unlock' : `Start night ${n}`;
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (locked) return;
        this.game.audio.click();
        this.game.startNight(n);
      });
      card.addEventListener('mouseenter', () => !locked && this.game.audio.uiHover());
      grid.appendChild(card);
    }
    this.show('nightSelect');
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  openSettings(from) {
    this.returnTo = from;
    this.fillSettings(this.game.save.settings);
    this.show('settings');
  }

  fillSettings(s) {
    document.querySelectorAll('[data-set]').forEach((el) => {
      const v = s[el.dataset.set];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = String(v);
    });
  }

  bindSettings() {
    document.querySelectorAll('[data-set]').forEach((el) => {
      const handler = () => {
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.type === 'range' || el.dataset.number !== undefined) v = Number(el.value);
        else v = el.value;
        this.game.updateSetting(el.dataset.set, v);
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
      el.addEventListener('click', (e) => e.stopPropagation());
    });
  }

  // ── Confirmation dialog ──────────────────────────────────────────────────

  confirm(text) {
    return new Promise((resolve) => {
      $('confirmText').textContent = text;
      const modal = $('confirm');
      modal.classList.remove('hidden');
      const done = (v) => {
        modal.classList.add('hidden');
        $('confirmYes').onclick = $('confirmNo').onclick = null;
        this.confirmOpen = null;
        this.game.audio.click();
        resolve(v);
      };
      this.confirmOpen = done;
      $('confirmYes').onclick = (e) => {
        e.stopPropagation();
        done(true);
      };
      $('confirmNo').onclick = (e) => {
        e.stopPropagation();
        done(false);
      };
    });
  }

  // ── Night intro / results ────────────────────────────────────────────────

  showIntro(night, memo) {
    $('introNight').textContent = night === MAX_NIGHT ? 'NIGHT 6 - CHALLENGE' : `NIGHT ${night}`;
    $('introMemo').textContent = '';
    this.show('intro');
    // typewriter memo
    clearInterval(this.typeTimer);
    let i = 0;
    this.typeTimer = setInterval(() => {
      $('introMemo').textContent = memo.slice(0, ++i);
      if (i >= memo.length) clearInterval(this.typeTimer);
    }, 22);
  }

  showGameOver(killer, session) {
    const c = CHARACTERS[killer];
    $('goKiller').textContent = c ? `CAUGHT BY ${c.name}` : '';
    const hour = session.displayHour;
    $('goTime').textContent = `Night ${session.night} · survived until ${hour} AM · ${Math.ceil(session.power)}% power left`;
    this.show('gameover');
  }

  showVictory(night, unlockedNext) {
    $('vSub').textContent = `NIGHT ${night} COMPLETE`;
    let text = '';
    if (night === MAIN_NIGHTS) text = "You made it through the week. Your paycheck: $120.50 and a coupon for a free slice of pizza. Something in Storage is still awake... CHALLENGE NIGHT UNLOCKED.";
    else if (night === MAX_NIGHT) text = "Nobody has ever lasted this long. The diner is quiet. For now. Thank you for playing.";
    else if (unlockedNext) text = `Night ${night + 1} unlocked. Progress saved.`;
    $('vText').textContent = text;
    const next = $('btnNextNight');
    next.classList.toggle('hidden', night >= MAX_NIGHT);
    next.textContent = night === MAIN_NIGHTS ? 'Attempt the Challenge Night' : `Continue to Night ${night + 1}`;
    // restart CSS animations
    const v = $('victory');
    v.querySelectorAll('.digit, .v-sub, .v-text, .v-buttons').forEach((el) => {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });
    const btns = v.querySelector('.v-buttons');
    btns.classList.remove('ready');
    setTimeout(() => btns.classList.add('ready'), 3600);
    this.show('victory');
  }

  // ── HUD ──────────────────────────────────────────────────────────────────

  buildUsageBars() {
    $('usageBars').innerHTML = '<i></i>'.repeat(6);
  }

  updateHud(session) {
    $('clockHour').textContent = String(session.displayHour);
    $('nightLabel').textContent = `NIGHT ${session.night}`;
    const p = Math.max(0, Math.ceil(session.power));
    $('powerPct').textContent = String(p);
    $('powerBox').classList.toggle('low', p <= 15);
    $('powerWarning').classList.toggle('hidden', !(p <= 10 && p > 0 && session.state === 'running'));
    const bars = $('usageBars').children;
    for (let i = 0; i < bars.length; i++) {
      bars[i].className = i < session.usage ? `on${i >= 4 ? ' hi' : i >= 2 ? ' mid' : ''}` : '';
    }
    $('camToggle').classList.toggle('disabled', session.state !== 'running');
    $('camToggle').classList.toggle('active', session.office.monitorUp);
    // camera map state
    for (const [room, btn] of Object.entries(this.camButtons)) {
      btn.classList.toggle('selected', session.office.cam === room);
      btn.classList.toggle('offline', session.camOffline[room] > 0);
    }
  }

  buildCamMap() {
    const map = $('camMap');
    map.innerHTML = '<div class="map-label">BUILDING MAP</div>';
    // corridors between rooms
    const center = (r) => {
      const L = MAP_LAYOUT[r];
      return [L.x + L.w / 2, L.y + L.h / 2];
    };
    const lines = [];
    const seen = new Set();
    for (const r of [...CAMERA_ROOMS]) {
      for (const n of ROOMS[r].links) {
        const key = [r, n].sort().join('-');
        if (seen.has(key)) continue;
        seen.add(key);
        const target = ROOMS[n].door ? 'OFFICE' : n;
        if (!MAP_LAYOUT[target]) continue;
        const [x1, y1] = center(r), [x2, y2] = center(target);
        lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(200,215,200,0.25)" stroke-width="6"/>`);
      }
    }
    map.insertAdjacentHTML('beforeend', `<svg width="380" height="300">${lines.join('')}</svg>`);
    for (const [room, L] of Object.entries(MAP_LAYOUT)) {
      const div = document.createElement('div');
      div.className = 'map-room' + (room === 'OFFICE' ? ' map-office' : '');
      Object.assign(div.style, { left: `${L.x}px`, top: `${L.y}px`, width: `${L.w}px`, height: `${L.h}px` });
      if (room === 'OFFICE') div.textContent = 'YOU';
      map.appendChild(div);
    }
    for (const room of CAMERA_ROOMS) {
      const L = MAP_LAYOUT[room];
      const b = document.createElement('button');
      b.className = 'cam-btn';
      b.textContent = `CAM ${ROOMS[room].cam}`;
      b.title = `CAM ${ROOMS[room].cam} - ${ROOMS[room].name}  [${Number(ROOMS[room].cam)}]`;
      Object.assign(b.style, { left: `${L.x + L.w / 2 - 29}px`, top: `${L.y + L.h / 2 - 15}px` });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.selectCam(room);
      });
      map.appendChild(b);
      this.camButtons[room] = b;
    }
  }

  setMonitor(up) {
    const m = $('monitor');
    clearTimeout(this.monTimer);
    m.classList.add('moving');
    m.classList.remove('ready');
    m.classList.toggle('up', up);
    m.setAttribute('aria-hidden', String(!up));
    // controls on the monitor only become clickable once it is fully raised
    this.monTimer = setTimeout(() => {
      m.classList.remove('moving');
      if (up) m.classList.add('ready');
    }, 280);
  }

  resetMonitor() {
    const m = $('monitor');
    m.classList.remove('up', 'ready', 'moving');
  }

  // ── Tooltip ──────────────────────────────────────────────────────────────

  showTooltip(text, x, y) {
    const t = $('tooltip');
    t.textContent = text;
    t.classList.remove('hidden');
    const w = t.offsetWidth;
    t.style.left = `${Math.min(1280 - w - 8, Math.max(8, x - w / 2))}px`;
    t.style.top = `${Math.max(8, y - 44)}px`;
  }

  hideTooltip() {
    $('tooltip').classList.add('hidden');
  }

  // ── Effects hooks ────────────────────────────────────────────────────────

  shake() {
    if (!this.game.save.settings.screenShake) return;
    const s = $('stage');
    s.classList.remove('shake');
    void s.offsetWidth;
    s.classList.add('shake');
  }

  glitchTitle() {
    const t = document.querySelector('.title');
    t.classList.remove('glitch');
    void t.offsetWidth;
    t.classList.add('glitch');
  }

  setDebug(text) {
    const d = $('debug');
    if (text == null) d.classList.add('hidden');
    else {
      d.classList.remove('hidden');
      d.textContent = text;
    }
  }
}
