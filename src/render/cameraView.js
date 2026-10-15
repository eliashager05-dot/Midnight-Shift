// ---------------------------------------------------------------------------
// Security camera feed renderer: scene + animatronics + CCTV post-processing
// (tint, static, scanlines, interference, labels).
// ---------------------------------------------------------------------------
import { VIEW_W, VIEW_H } from '../config.js';
import { ROOMS } from '../world/map.js';
import { buildScenes, SCENE_W } from './scenes.js';
import { drawCharacter, drawHead } from './characters.js';
import { ellipse } from './painter.js';

const CHAR_H = 2.05; // metres an animatronic stands tall

export class CameraView {
  constructor(effects) {
    this.fx = effects;
    this.scenes = buildScenes();
    this.switchStatic = 0; // static burst after switching cameras
    this.glitch = 0;
  }

  onSwitch() {
    this.switchStatic = 0.32;
  }

  /** Small random interference event (bird distraction, ambient glitch) */
  interfere(seconds = 0.4) {
    this.glitch = Math.max(this.glitch, seconds);
  }

  render(ctx, session, t, dt) {
    const room = session.office.cam;
    const scene = this.scenes[room];
    const P = scene.P;
    this.switchStatic = Math.max(0, this.switchStatic - dt);
    this.glitch = Math.max(0, this.glitch - dt);
    if (Math.random() < dt * 0.08) this.interfere(0.15 + Math.random() * 0.25);

    // slow mechanical pan back and forth
    const panRange = SCENE_W - VIEW_W;
    const ph = (Math.sin(t * 0.22) + 1) / 2;
    const panX = Math.round(panRange * (0.15 + ph * 0.7));

    // light flicker for rooms that have a dodgy lamp
    let light = 1;
    if (scene.def.flicker && Math.sin(t * 13) * Math.sin(t * 2.1) > 0.75) light = 0.35;

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.translate(-panX, 0);
    ctx.drawImage(scene.base, 0, 0);
    scene.def.dynamic?.(ctx, P, { session, t, light });

    // animatronics in this room, far to near
    const eyesAfter = [];
    const placed = [];
    for (const a of session.animatronics) {
      if (!a.onCamera || a.room !== room) continue;
      if (a.id === 'runner') {
        if (a.state === 'CHARGING' && room === 'WEST') {
          const Z = 17 - a.chargeProgress * 14.5;
          placed.push({ a, X: 0.05, Y: 0, Z, pose: 'run' });
        }
        continue; // storage version drawn by scene.dynamic
      }
      const slots = scene.def.slots[a.id];
      if (!slots?.length) continue;
      let slot = slots[a.pose % slots.length];
      if (a.hidden) slot = slots.find((s) => s.dark) ?? slot;
      placed.push({ a, ...slot, Y: slot.Y ?? 0 });
    }
    placed.sort((p, q) => q.Z - p.Z);
    for (const p of placed) {
      const [x, y] = P.p(p.X, p.Y, p.Z);
      const s = (P.scale(p.Z) * CHAR_H) / 420;
      if (p.a.hidden) {
        eyesAfter.push({ id: p.a.id, x, y, s });
        continue;
      }
      const near = p.Z < 6;
      drawCharacter(ctx, p.a.id, x, y, s, {
        light: (near ? 0.85 : 0.65) * light,
        eyes: p.a.state === 'APPROACHING' || near ? 'glow' : 'dim',
        t: t + p.a.id.length,
        pose: p.pose ?? (p.a.state === 'APPROACHING' ? 'lean' : 'stand'),
        twitch: 0.6,
        look: Math.sin(t * 0.3 + p.a.moves) * 0.6,
        jaw: near ? 0.25 : 0.05,
        tilt: ((p.a.moves * 37) % 7) * 0.02 - 0.06,
      });
    }

    ctx.drawImage(scene.dark, 0, 0);
    if (light < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - light})`;
      ctx.fillRect(panX, 0, VIEW_W, VIEW_H);
    }
    // eyes of whoever is lurking in the dark
    for (const e of eyesAfter) {
      if (Math.sin(t * 1.3 + e.x) < -0.2) continue; // blinks
      const hy = e.y - 345 * e.s, dx = 30 * e.s;
      ctx.save();
      ctx.shadowColor = '#cfe6ff';
      ctx.shadowBlur = 10;
      ellipse(ctx, e.x - dx, hy, Math.max(1.2, 4 * e.s), Math.max(1, 3 * e.s), 'rgba(210,230,255,0.85)');
      ellipse(ctx, e.x + dx, hy, Math.max(1.2, 4 * e.s), Math.max(1, 3 * e.s), 'rgba(210,230,255,0.85)');
      ctx.restore();
    }
    ctx.restore();

    // Pippa sticking her face into the lens
    const peek = session.peek;
    if (peek && peek.room === room) {
      const k = 1 - peek.t / 1.1;
      drawHead(ctx, peek.id, VIEW_W / 2 + Math.sin(t * 40) * 6, VIEW_H / 2 + 40, 3.6 + k * 0.8, {
        light: 0.9, eyes: 'glow', jaw: 0.4 + Math.sin(t * 25) * 0.2, tilt: Math.sin(t * 9) * 0.15,
      });
    }

    this.post(ctx, session, room, t, scene);
  }

  post(ctx, session, room, t, scene) {
    const fx = this.fx;
    // CCTV colour grade: teal-green multiply + lifted blacks
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#b2d4c6';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = '#141f1a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();

    const disrupted = session.camDisrupt[room] > 0;
    const offline = session.camOffline[room] > 0;
    let staticA = 0.06 + (scene.def.degraded ? 0.09 : 0);
    if (this.glitch > 0) staticA += 0.25;
    if (this.switchStatic > 0) staticA += this.switchStatic * 2.6;
    if (session.peek?.room === room) staticA += 0.2;
    if (disrupted) staticA = Math.max(staticA, 0.75 + Math.random() * 0.2);
    if (offline) staticA = 1;

    if (offline) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    fx.static(ctx, t, staticA * (offline ? 0.35 : 1));
    if (this.glitch > 0 || disrupted) fx.tear(ctx, ctx.canvas, disrupted ? 1.5 : 0.7);
    fx.rollingBar(ctx, t);
    fx.scanlines(ctx, 0.45);
    fx.vignette(ctx, 0.6);

    // overlay text
    ctx.save();
    ctx.font = '34px VT323, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(220,235,220,0.9)';
    ctx.shadowColor = 'rgba(180,255,200,0.5)';
    ctx.shadowBlur = 6;
    const info = ROOMS[room];
    ctx.fillText(`CAM ${info.cam}`, 40, 34);
    ctx.font = '26px VT323, monospace';
    ctx.fillText(info.name.toUpperCase(), 40, 66);
    if (Math.floor(t * 1.4) % 2 === 0) {
      ctx.fillStyle = '#c0281e';
      ctx.beginPath();
      ctx.arc(VIEW_W / 2 - 50, 52, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(220,235,220,0.9)';
      ctx.fillText('REC', VIEW_W / 2 - 34, 40);
    }
    if (offline) {
      ctx.font = '44px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NO SIGNAL', VIEW_W / 2, VIEW_H / 2 - 40);
      ctx.font = '26px VT323, monospace';
      ctx.fillText('CAMERA OFFLINE - RECONNECTING', VIEW_W / 2, VIEW_H / 2 + 6);
    } else if (disrupted) {
      ctx.font = '30px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('-- SIGNAL INTERFERENCE --', VIEW_W / 2, VIEW_H / 2 - 20);
    } else if (scene.def.degraded) {
      ctx.font = '22px VT323, monospace';
      ctx.fillStyle = 'rgba(220,200,120,0.75)';
      ctx.fillText('VIDEO DEGRADED', 40, 96);
    }
    ctx.restore();
  }
}
