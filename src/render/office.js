// ---------------------------------------------------------------------------
// The security office: a panoramic, pannable room rendered with the same
// Persp projector as the cameras. Static art is baked once; doors, lights,
// fan, lamp flicker, dust, hallway occupants and power-out are drawn live.
// ---------------------------------------------------------------------------
import { VIEW_W, VIEW_H, WORLD_W } from '../config.js';
import { makeCanvas, seeded, Persp, poly, ellipse, grime, darknessMap, shade, roundRect, glow, noiseCanvas, clamp } from './painter.js';
import { drawCharacter, drawHead } from './characters.js';

const ROOM = { x0: -3.2, x1: 3.2, z0: 1.15, z1: 4.3, h: 3.0 };
const DOOR = { z0: 2.4, z1: 3.5, h: 2.3 };
const PANEL = { z0: 3.62, z1: 4.18, y0: 0.5, y1: 1.9 };
const BTN = { z0: 3.74, z1: 4.06, door: [1.25, 1.65], light: [0.72, 1.12] };
const HALL_W = 1.5; // corridor width beyond each doorway

export class OfficeView {
  constructor(effects) {
    this.fx = effects;
    this.P = new Persp({ vx: WORLD_W / 2, vy: 330, F: 700, camY: 1.5 });
    this.viewX = (WORLD_W - VIEW_W) / 2;
    this.fanAngle = 0;
    this.flicker = 0; // remaining seconds of lamp flicker
    this.flickerLevel = 1;
    this.shadowPass = null;
    this.highlight = null; // tutorial: name of a hit region to ring
    this.hover = null;
    this.rnd = seeded(4242);
    this.dust = Array.from({ length: 40 }, () => ({ x: 700 + Math.random() * 520, y: 120 + Math.random() * 420, v: 4 + Math.random() * 10, p: Math.random() * 6 }));
    this.screenNoise = noiseCanvas(96, 64, { seed: 55 });
    this.buildRegions();
    this.base = this.buildBase();
    this.dark = darknessMap(WORLD_W, VIEW_H, 0.8, [
      { x: WORLD_W / 2, y: 560, r: 560, strength: 0.88, sx: 1.6, sy: 0.9 },
      { x: WORLD_W / 2, y: 260, r: 420, strength: 0.55, sx: 1.3 },
      { x: WORLD_W / 2 - 60, y: 480, r: 180, strength: 0.4 },
    ]);
  }

  // ── Geometry helpers ─────────────────────────────────────────────────────

  wallX(side) {
    return side === 'left' ? ROOM.x0 : ROOM.x1;
  }

  /** projected quad of a rectangle on a side wall */
  wallQuad(side, z0, z1, y0, y1, inset = 0) {
    const x = this.wallX(side) + (side === 'left' ? inset : -inset);
    const P = this.P;
    return [P.p(x, y0, z0), P.p(x, y0, z1), P.p(x, y1, z1), P.p(x, y1, z0)];
  }

  buildRegions() {
    const bbox = (q) => {
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), quad: q };
    };
    this.regions = {};
    for (const side of ['left', 'right']) {
      this.regions[`${side}Door`] = { ...bbox(this.wallQuad(side, BTN.z0, BTN.z1, BTN.door[0], BTN.door[1], 0.02)), side, kind: 'door' };
      this.regions[`${side}Light`] = { ...bbox(this.wallQuad(side, BTN.z0, BTN.z1, BTN.light[0], BTN.light[1], 0.02)), side, kind: 'light' };
      this.regions[`${side}Doorway`] = { ...bbox(this.wallQuad(side, DOOR.z0, DOOR.z1, 0, DOOR.h)), side, kind: 'doorway' };
    }
    // the little plush on the desk
    const [px, py] = this.P.p(1.12, 0.78, 2.3);
    this.regions.plush = { x: px - 34, y: py - 66, w: 68, h: 68, kind: 'plush' };
  }

  /** Which interactive region is under a world-space point */
  hitTest(wx, wy) {
    for (const key of ['leftDoor', 'leftLight', 'rightDoor', 'rightLight', 'plush']) {
      const r = this.regions[key];
      if (wx >= r.x - 6 && wx <= r.x + r.w + 6 && wy >= r.y - 6 && wy <= r.y + r.h + 6) return { key, ...r };
    }
    return null;
  }

  // ── Static art ───────────────────────────────────────────────────────────

  buildBase() {
    const c = makeCanvas(WORLD_W, VIEW_H);
    const ctx = c.getContext('2d');
    const P = this.P;
    const rnd = seeded(77);
    const { x0, x1, z0, z1, h } = ROOM;
    ctx.fillStyle = '#07080a';
    ctx.fillRect(0, 0, WORLD_W, VIEW_H);

    P.room(ctx, { x0, x1, z0, z1, h, ceiling: '#0e1012', floor: '#121416' });
    P.checker(ctx, x0, x1, z0, z1, 0.42, '#3a3c3e', '#121314');
    P.sideWall(ctx, x0, z0, z1, h, '#2a3034', '#384046');
    P.sideWall(ctx, x1, z0, z1, h, '#2a3034', '#384046');
    P.backRect(ctx, x0, x1, 0, h, z1, '#3a4146');
    // concrete texture on back wall
    const [bl, bt] = P.p(x0, h, z1), [br, bb] = P.p(x1, 0, z1);
    grime(ctx, bl, bt, br - bl, bb - bt, rnd, { count: 60, strength: 0.35 });

    // checkered wainscot band on all walls
    for (let x = x0, i = 0; x < x1; x += 0.25, i++) P.backRect(ctx, x, Math.min(x1, x + 0.25), 0.82, 1.0, z1 - 0.01, i & 1 ? '#151515' : '#6c6c64');
    for (const wx of [x0, x1]) {
      for (let z = z0, i = 0; z < z1; z += 0.25, i++) {
        if (z + 0.25 > DOOR.z0 && z < DOOR.z1) continue;
        P.wallRect(ctx, wx, z, Math.min(z1, z + 0.25), 0.82, 1.0, i & 1 ? '#151515' : '#5c5c56');
      }
    }
    P.backRect(ctx, x0, x1, 0, 0.12, z1 - 0.01, '#0e0e0e');

    // ceiling pipes + cable runs
    for (const [X, col] of [[-1.6, '#2a2e30'], [-1.35, '#3a2a22'], [2.2, '#24282a']]) {
      const [ax, ay] = P.p(X, h - 0.08, z0), [bx, by] = P.p(X, h - 0.08, z1);
      ctx.strokeStyle = col;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    // ceiling vent
    P.quad(ctx, [[0.9, h, 2.6], [1.7, h, 2.6], [1.7, h, 3.2], [0.9, h, 3.2]], '#1a1c1e', '#050505', 2);
    for (let z = 2.65; z < 3.2; z += 0.08) {
      const [ax, ay] = P.p(0.95, h, z), [bx, by] = P.p(1.65, h, z);
      ctx.strokeStyle = '#060606';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // ── back wall decorations
    // big CELEBRATE poster with Mortimer
    P.backRect(ctx, -2.75, -1.65, 1.25, 2.55, z1 - 0.02, '#5e3a30', '#1a0e0a', 3);
    const [mx, my] = P.p(-2.2, 2.0, z1);
    drawHead(ctx, 'bear', mx, my, 0.5, { light: 0.9, eyes: 'dim', jaw: 0.15 });
    ctx.save();
    ctx.font = '22px Special Elite, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(230,210,160,0.8)';
    ctx.fillText('CELEBRATE!', mx, my + 74);
    ctx.restore();
    // cork board with notes
    P.backRect(ctx, -1.3, -0.3, 1.45, 2.25, z1 - 0.02, '#5a4630', '#20160c', 3);
    for (let i = 0; i < 7; i++) {
      const X = -1.22 + rnd() * 0.7, Y = 1.55 + rnd() * 0.5;
      P.backRect(ctx, X, X + 0.2 + rnd() * 0.1, Y, Y + 0.18, z1 - 0.03, shade('#c8c0a8', 0.6 + rnd() * 0.3));
      const [nx, ny] = P.p(X + 0.1, Y + 0.16, z1);
      ellipse(ctx, nx, ny, 3, 3, ['#8a2a2a', '#2a5a8a', '#8a8a2a'][i % 3]);
    }
    // safety notice
    P.backRect(ctx, 0.3, 1.0, 1.55, 2.3, z1 - 0.02, '#a8a490', '#222', 2);
    ctx.save();
    const [sx, sy] = P.p(0.65, 2.2, z1);
    ctx.fillStyle = 'rgba(40,30,20,0.85)';
    ctx.font = 'bold 14px Special Elite, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NIGHT STAFF', sx, sy);
    ctx.font = '10px Special Elite, monospace';
    ['1. CONSERVE POWER', '2. DOORS ONLY IF', '   NECESSARY', '3. DO NOT ENGAGE', '   THE CHARACTERS', '4. STAY IN OFFICE'].forEach((l, i) => ctx.fillText(l, sx, sy + 18 + i * 13));
    ctx.restore();
    // children's drawings
    for (let i = 0; i < 4; i++) {
      const X = 1.35 + (i % 2) * 0.62, Y = 1.4 + Math.floor(i / 2) * 0.6;
      P.backRect(ctx, X, X + 0.5, Y, Y + 0.45, z1 - 0.02, '#9a968a');
      const [dx, dy] = P.p(X + 0.25, Y + 0.22, z1);
      ctx.strokeStyle = ['#6a2a2a', '#2a3a6a', '#3a5a2a', '#5a4a1a'][i];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dx, dy - 10, 9, 0, Math.PI * 2);
      ctx.moveTo(dx, dy - 1);
      ctx.lineTo(dx, dy + 18);
      ctx.moveTo(dx - 12, dy + 6);
      ctx.lineTo(dx + 12, dy + 6);
      ctx.stroke();
      if (i === 3) {
        // one drawing has red scribbled eyes
        ellipse(ctx, dx - 4, dy - 12, 2, 2, '#8a1a1a');
        ellipse(ctx, dx + 4, dy - 12, 2, 2, '#8a1a1a');
      }
    }

    // ── doorways (openings) and control panels on the side walls
    for (const side of ['left', 'right']) {
      poly(ctx, this.wallQuad(side, DOOR.z0 - 0.08, DOOR.z1 + 0.08, 0, DOOR.h + 0.12), '#3c3a30');
      // hazard stripes on frame
      const fq = this.wallQuad(side, DOOR.z1, DOOR.z1 + 0.08, 0, DOOR.h + 0.12);
      poly(ctx, fq, '#6a5a1a');
      poly(ctx, this.wallQuad(side, DOOR.z0, DOOR.z1, 0, DOOR.h), '#000');
      poly(ctx, this.wallQuad(side, PANEL.z0, PANEL.z1, PANEL.y0, PANEL.y1), '#23272a', '#0a0a0a', 2);
      for (const y of [PANEL.y0 + 0.05, PANEL.y1 - 0.05]) {
        const [qx, qy] = this.P.p(this.wallX(side), y, (PANEL.z0 + PANEL.z1) / 2);
        ellipse(ctx, qx, qy, 3, 3, '#555');
      }
      // labels
      for (const [label, yy] of [['DOOR', BTN.door[1] + 0.1], ['LIGHT', BTN.light[1] + 0.1]]) {
        const [lx, ly] = this.P.p(this.wallX(side), yy, (BTN.z0 + BTN.z1) / 2);
        ctx.save();
        ctx.font = '17px VT323, monospace';
        ctx.fillStyle = 'rgba(210,210,190,0.85)';
        ctx.textAlign = 'center';
        ctx.fillText(label, lx, ly);
        ctx.restore();
      }
    }

    // ── desk
    const dz0 = 1.85, dz1 = 2.65, dh = 0.78;
    P.box(ctx, -1.5, 0, dz0, 3.0, dh, dz1 - dz0, { top: '#3d3530', front: '#221c18', side: '#1a1512' });
    // desk front panel detail
    P.backRect(ctx, -1.45, 1.45, 0.05, 0.7, dz0 - 0.001, '#1d1815');
    // papers
    for (let i = 0; i < 6; i++) {
      const X = -1.35 + rnd() * 0.8, Z = dz0 + 0.05 + rnd() * 0.5;
      P.quad(ctx, [[X, dh, Z], [X + 0.22, dh, Z + 0.02], [X + 0.2, dh, Z + 0.3], [X - 0.02, dh, Z + 0.28]], shade('#b8b4a0', 0.55 + rnd() * 0.25));
    }
    // CRT monitor
    P.box(ctx, -0.5, dh, 2.2, 0.62, 0.48, 0.42, { top: '#3a3a36', front: '#2c2c28', side: '#1e1e1c' });
    // keyboard
    P.quad(ctx, [[-0.5, dh + 0.01, 1.95], [0.1, dh + 0.01, 1.95], [0.1, dh + 0.01, 2.12], [-0.5, dh + 0.01, 2.12]], '#2a2a26');
    // coffee cup
    const [cx, cy] = P.p(-0.95, dh, 2.05);
    roundRect(ctx, cx - 14, cy - 34, 28, 34, 4, '#6a6a60');
    ellipse(ctx, cx, cy - 34, 14, 4, '#1a120c');
    // drawers
    for (let i = 0; i < 3; i++) P.backRect(ctx, 0.9, 1.35, 0.12 + i * 0.2, 0.28 + i * 0.2, dz0 - 0.002, '#2a231e', '#0e0b09', 1);
    // phone
    P.box(ctx, 0.2, dh, 2.35, 0.3, 0.08, 0.22, { top: '#1a1a1a', front: '#111', side: '#0e0e0e' });

    // ceiling lamp cord + shade
    const [lx0, ly0] = P.p(0, h, 3.3), [lx1, ly1] = P.p(0, 2.45, 3.3);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx0, ly0);
    ctx.lineTo(lx1, ly1);
    ctx.stroke();

    grime(ctx, 0, 0, WORLD_W, VIEW_H, rnd, { count: 70, strength: 0.25, drips: true });
    return c;
  }

  // ── Per-frame drawing ────────────────────────────────────────────────────

  /** Pan the view with the mouse near the screen edges. */
  updatePan(dt, mouseX, active) {
    if (!active || mouseX == null) return;
    const edge = VIEW_W * 0.3;
    let v = 0;
    if (mouseX < edge) v = -((edge - mouseX) / edge);
    else if (mouseX > VIEW_W - edge) v = (mouseX - (VIEW_W - edge)) / edge;
    this.viewX = clamp(this.viewX + v * Math.abs(v) * 1100 * dt, 0, WORLD_W - VIEW_W);
  }

  panBy(dx) {
    this.viewX = clamp(this.viewX + dx, 0, WORLD_W - VIEW_W);
  }

  triggerFlicker(seconds = 0.8) {
    this.flicker = Math.max(this.flicker, seconds);
  }

  render(ctx, session, t, dt, opts = {}) {
    const P = this.P;
    const powerOut = session.state === 'powerout' || (session.state === 'lost' && session.powerOut);
    // fan spins down when the power dies
    this.fanSpeed = powerOut ? Math.max(0, (this.fanSpeed ?? 22) - dt * 6) : 22;
    this.fanAngle += dt * this.fanSpeed;
    if (!powerOut && Math.random() < dt * 0.05) this.triggerFlicker(0.3 + Math.random() * 0.9);
    if (this.flicker > 0) {
      this.flicker -= dt;
      this.flickerLevel = Math.random() < 0.35 ? 0.35 + Math.random() * 0.3 : 1;
    } else this.flickerLevel = 1;
    if (!this.shadowPass && Math.random() < dt * 0.015) this.shadowPass = { x: -300, v: 160 + Math.random() * 120 };

    ctx.save();
    ctx.translate(-Math.round(this.viewX), 0);
    ctx.drawImage(this.base, 0, 0);

    // monitor screen glow
    const scr = [P.p(-0.45, 0.83, 2.2), P.p(0.07, 0.83, 2.2), P.p(0.07, 1.2, 2.2), P.p(-0.45, 1.2, 2.2)];
    ctx.save();
    poly(ctx, scr, '#0b1a14');
    ctx.clip();
    if (!powerOut) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.screenNoise, scr[3][0], scr[3][1], scr[1][0] - scr[3][0], scr[0][1] - scr[3][1]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(120,220,160,0.75)';
      ctx.font = '13px VT323, monospace';
      ctx.fillText('CAM SYS v2.1', scr[3][0] + 8, scr[3][1] + 18);
      ctx.fillText(`PWR ${Math.ceil(session.power)}%`, scr[3][0] + 8, scr[3][1] + 34);
      if (Math.floor(t * 2) % 2) ctx.fillText('_', scr[3][0] + 8, scr[3][1] + 50);
    }
    ctx.restore();

    this.drawFan(ctx, t, powerOut);
    this.drawPlush(ctx, t);

    // shadow drifting across the back wall
    if (this.shadowPass) {
      const sp = this.shadowPass;
      sp.x += sp.v * dt;
      const g = ctx.createRadialGradient(sp.x + 600, 260, 10, sp.x + 600, 260, 160);
      g.addColorStop(0, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sp.x + 440, 60, 320, 420);
      if (sp.x > 1000) this.shadowPass = null;
    }

    // global darkness
    ctx.drawImage(this.dark, 0, 0);
    if (this.flickerLevel < 1) {
      ctx.fillStyle = `rgba(0,0,0,${(1 - this.flickerLevel) * 0.7})`;
      ctx.fillRect(0, 0, WORLD_W, VIEW_H);
    }

    // lamp cone + dust
    if (!powerOut) {
      const [lx, ly] = P.p(0, 2.45, 3.3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sway = Math.sin(t * 0.9) * 8;
      const g = ctx.createLinearGradient(lx, ly, lx, ly + 420);
      g.addColorStop(0, `rgba(255,236,190,${0.16 * this.flickerLevel})`);
      g.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = g;
      poly(ctx, [[lx - 34 + sway, ly + 6], [lx + 34 + sway, ly + 6], [lx + 360 + sway * 3, ly + 420], [lx - 360 + sway * 3, ly + 420]], g);
      for (const d of this.dust) {
        d.y -= d.v * dt * 0.3;
        d.p += dt;
        if (d.y < 140) d.y = 540;
        ctx.fillStyle = `rgba(255,240,210,${0.12 + 0.1 * Math.sin(d.p)})`;
        ctx.fillRect(d.x + Math.sin(d.p) * 10, d.y, 2, 2);
      }
      ctx.restore();
      // lamp shade
      poly(ctx, [[lx - 30 + sway * 0.2, ly - 12], [lx + 30 + sway * 0.2, ly - 12], [lx + 44 + sway * 0.2, ly + 8], [lx - 44 + sway * 0.2, ly + 8]], '#2a2c28');
      glow(ctx, lx + sway * 0.2, ly + 10, 26, '#fff2c8', 0.8 * this.flickerLevel);
    }

    for (const side of ['left', 'right']) this.drawDoorway(ctx, session, side, t, powerOut);

    // power-out: total darkness, Mortimer's face glowing in the left doorway during the music
    if (powerOut) {
      ctx.fillStyle = 'rgba(0,0,0,0.94)';
      ctx.fillRect(0, 0, WORLD_W, VIEW_H);
      const phase = session.powerOut?.phase;
      if (phase === 'music') {
        const on = Math.sin(t * 7) * Math.sin(t * 2.3) > -0.1;
        if (on) {
          const [fx, fy] = P.p(-3.75, 0, 3.0);
          const s = (P.scale(3.0) * 2.05) / 420;
          drawCharacter(ctx, 'bear', fx, fy, s, { light: 0.22, eyes: 'glow', t, jaw: 0.2 + 0.15 * Math.sin(t * 4), tilt: Math.sin(t * 1.5) * 0.08 });
        }
      }
    }

    // tutorial highlight ring
    if (this.highlight && this.regions[this.highlight]) {
      const r = this.regions[this.highlight];
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.strokeStyle = `rgba(230,210,120,${0.4 + pulse * 0.6})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x - 8 - pulse * 4, r.y - 8 - pulse * 4, r.w + 16 + pulse * 8, r.h + 16 + pulse * 8);
    }
    ctx.restore();

    this.fx.grain(ctx, t, 0.09);
    this.fx.vignette(ctx, 0.9);
  }

  drawFan(ctx, t, off) {
    const P = this.P;
    const [bx, by] = P.p(0.85, 0.78, 2.4);
    const s = P.scale(2.4);
    const r = 0.17 * s;
    const cy = by - 0.33 * s;
    roundRect(ctx, bx - 26, by - 10, 52, 12, 4, '#1c1c1a');
    ctx.fillStyle = '#222';
    ctx.fillRect(bx - 4, cy, 8, by - cy - 8);
    ellipse(ctx, bx, cy, r + 6, r + 6, '#151514');
    ctx.save();
    ctx.translate(bx, cy);
    ctx.rotate(this.fanAngle);
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ellipse(ctx, r * 0.5, 0, r * 0.48, r * 0.2, off ? '#3a3a34' : 'rgba(70,70,62,0.75)');
    }
    ctx.restore();
    ellipse(ctx, bx, cy, 7, 7, '#333');
    ctx.strokeStyle = 'rgba(90,90,80,0.8)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(bx, cy);
      ctx.lineTo(bx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(bx, cy, r + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawPlush(ctx, t) {
    const r = this.regions.plush;
    const squish = this.plushSquish > 0 ? Math.sin(this.plushSquish * 30) * 0.08 : 0;
    this.plushSquish = Math.max(0, (this.plushSquish ?? 0) - 1 / 60);
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h);
    ctx.scale(1 + squish, 1 - squish);
    ellipse(ctx, 0, -14, 22, 16, '#4a3424');
    drawHead(ctx, 'bear', 0, -38, 0.24, { light: 0.75, eyes: 'dim' });
    ctx.restore();
  }

  squeezePlush() {
    this.plushSquish = 0.35;
  }

  drawDoorway(ctx, session, side, t, powerOut) {
    const P = this.P;
    const d = session.office[side];
    const wx = this.wallX(side);
    const sgn = side === 'left' ? -1 : 1;
    const opening = this.wallQuad(side, DOOR.z0, DOOR.z1, 0, DOOR.h);
    const lit = d.light && !powerOut;

    ctx.save();
    poly(ctx, opening, '#000');
    ctx.clip();
    if (lit) {
      // corridor beyond the doorway: far wall, floor, ceiling
      // (depth is clamped to stay in front of the camera)
      const far = wx + sgn * HALL_W;
      const zNear = 1.2, zFar = DOOR.z1 + 4;
      ctx.fillStyle = '#1c1c1a';
      ctx.fillRect(Math.min(...opening.map((p) => p[0])), 0, 600, VIEW_H);
      P.quad(ctx, [[wx, DOOR.h + 0.3, zNear], [far, DOOR.h + 0.3, zNear], [far, DOOR.h + 0.3, zFar], [wx, DOOR.h + 0.3, zFar]], '#121210');
      P.checker(ctx, Math.min(wx, far), Math.max(wx, far), zNear, zFar, 0.4, '#5a5a52', '#1e1e1c');
      P.wallRect(ctx, far, zNear, zFar, 0, DOOR.h + 0.3, '#56564c');
      for (let z = zNear, i = 0; z < zFar; z += 0.3, i++) P.wallRect(ctx, far, z, z + 0.3, 0.82, 1.0, i & 1 ? '#151515' : '#7a7a70');
      P.wallRect(ctx, far, DOOR.z0 + 0.1, DOOR.z0 + 0.8, 1.2, 1.9, '#6a4a3a');
      P.wallRect(ctx, far, DOOR.z1 + 0.6, DOOR.z1 + 1.2, 1.25, 1.85, '#3a4a5a');
      // light falls off down the corridor
      const [nx] = P.p(far, 0, zNear), [fx2] = P.p(far, 0, zFar);
      const fall = ctx.createLinearGradient(nx, 0, fx2, 0);
      fall.addColorStop(0, 'rgba(0,0,0,0)');
      fall.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = fall;
      ctx.fillRect(Math.min(nx, fx2), 0, Math.abs(fx2 - nx), VIEW_H);
      const [gx, gy] = P.p(wx + sgn * 0.6, 1.0, (DOOR.z0 + DOOR.z1) / 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, gx, gy, 260, '#d8c890', 0.18);
      ctx.restore();
    }
    // who is standing there?
    const who = session.atDoor(side);
    if (who && !powerOut) {
      const X = wx + sgn * 0.42, Z = (DOOR.z0 + DOOR.z1) / 2 + 0.05;
      const [fx, fy] = P.p(X, 0, Z);
      const s = (P.scale(Z) * 2.05) / 420;
      if (lit) {
        drawCharacter(ctx, who.id, fx, fy, s, {
          light: 0.95, eyes: 'glow', t, pose: 'lean', flip: side === 'right', jaw: 0.15 + 0.1 * Math.sin(t * 2), twitch: 1, look: -sgn,
        });
      } else if (who.id === 'bear' || Math.sin(t * 0.9) > 0.7) {
        // faint eye-shine in the dark - a free (but subtle) warning
        const [ex, ey] = P.p(X, 1.72, Z);
        ctx.save();
        ctx.shadowColor = '#d8e8ff';
        ctx.shadowBlur = 6;
        ellipse(ctx, ex - 9, ey, 1.6, 1.2, 'rgba(220,235,255,0.55)');
        ellipse(ctx, ex + 9, ey, 1.6, 1.2, 'rgba(220,235,255,0.55)');
        ctx.restore();
      }
    }
    ctx.restore();

    // light spill on the office floor
    if (lit) {
      const [sx, sy] = P.p(wx - sgn * 0.6, 0, (DOOR.z0 + DOOR.z1) / 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, sx, sy, 200, '#d8c890', 0.12);
      ctx.restore();
    }

    // security shutter sliding down
    if (d.anim > 0) {
      const bottom = DOOR.h * (1 - d.anim);
      ctx.save();
      poly(ctx, opening);
      ctx.clip();
      for (let y = DOOR.h, i = 0; y > bottom; y -= 0.14, i++) {
        poly(ctx, this.wallQuad(side, DOOR.z0, DOOR.z1, Math.max(bottom, y - 0.14), y, 0.01), i & 1 ? '#2c3034' : '#3c4246');
      }
      poly(ctx, this.wallQuad(side, DOOR.z0, DOOR.z1, bottom, bottom + 0.12, 0.012), '#5a4a14');
      ctx.restore();
    }

    // buttons
    const doorR = this.regions[`${side}Door`], lightR = this.regions[`${side}Light`];
    const dead = powerOut;
    const hovD = this.hover === `${side}Door`, hovL = this.hover === `${side}Light`;
    poly(ctx, doorR.quad, d.closed && !dead ? '#c8281e' : hovD ? '#5a2a26' : '#3a1a18', '#000', 2);
    poly(ctx, lightR.quad, d.light && !dead ? '#e8e0b0' : hovL ? '#4a4a40' : '#2a2a26', '#000', 2);
    if (d.closed && !dead) glow(ctx, doorR.x + doorR.w / 2, doorR.y + doorR.h / 2, 50, '#ff3020', 0.35);
    if (d.light && !dead) glow(ctx, lightR.x + lightR.w / 2, lightR.y + lightR.h / 2, 50, '#fff0c0', 0.35);
  }
}
