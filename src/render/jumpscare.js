// ---------------------------------------------------------------------------
// Jumpscares: each animatronic has its own entry motion, jaw animation and
// shake pattern. Flashing is limited and can be disabled entirely
// (Reduced Flashing setting replaces bright flashes with dark pulses).
// ---------------------------------------------------------------------------
import { VIEW_W, VIEW_H } from '../config.js';
import { drawHead } from './characters.js';
import { easeOut } from './painter.js';

const CX = VIEW_W / 2, CY = VIEW_H / 2 + 30;

export class Jumpscare {
  constructor(effects) {
    this.fx = effects;
    this.active = false;
  }

  start(id, { reducedFlashing = false, shake = true } = {}) {
    this.id = id;
    this.t = 0;
    this.duration = id === 'runner' ? 1.35 : 1.55;
    this.reduced = reducedFlashing;
    this.shake = shake ? 1 : 0.2;
    this.active = true;
  }

  get done() {
    return this.t >= this.duration;
  }

  /** Motion curve per character: returns {x, y, s, tilt} for the head. */
  pose(t) {
    const k = easeOut(Math.min(1, t / 0.22));
    switch (this.id) {
      case 'bear': // lunges in from the left doorway
        return { x: 180 + (CX - 180) * k, y: CY + 40 - 40 * k, s: 0.9 + 3.6 * k, tilt: -0.25 * (1 - k) + Math.sin(t * 30) * 0.04 };
      case 'rabbit': // drops down from above, head jerking sideways
        return { x: CX + Math.sin(t * 22) * 18, y: -200 + (CY + 200) * k, s: 1.2 + 3.4 * k, tilt: 0.35 * Math.sin(t * 14) * (1 - t / 2) };
      case 'bird': // rises from below with violent head tilts
        return { x: CX, y: VIEW_H + 300 - (VIEW_H + 300 - CY) * k, s: 1.4 + 3.3 * k, tilt: Math.sin(t * 26) * 0.35 };
      case 'runner': { // sprints across from the left side and snaps forward
        const k2 = easeOut(Math.min(1, t / 0.16));
        // long snout: centre lower so the snapping jaw stays on screen
        return { x: -300 + (CX + 300) * k2, y: CY - 30 - 120 * k2, s: 1.6 + 3.0 * k2, tilt: 0.3 * (1 - k2) + Math.sin(t * 34) * 0.05 };
      }
      default:
        return { x: CX, y: CY, s: 4, tilt: 0 };
    }
  }

  render(ctx, dt, drawBackground) {
    this.t += dt;
    const t = this.t;
    ctx.save();
    // screen shake
    const amp = (t < 0.9 ? 26 : 26 * Math.max(0, 1 - (t - 0.9) / 0.6)) * this.shake;
    ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    drawBackground?.(ctx);
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.75, t * 3)})`;
    ctx.fillRect(-50, -50, VIEW_W + 100, VIEW_H + 100);

    const p = this.pose(t);
    const jaw = 0.55 + 0.45 * Math.abs(Math.sin(t * 19));
    // motion trails for the runner
    if (this.id === 'runner' && t < 0.25) {
      for (let i = 1; i <= 4; i++) {
        const q = this.pose(Math.max(0, t - i * 0.03));
        ctx.globalAlpha = 0.18;
        drawHead(ctx, this.id, q.x, q.y, q.s, { light: 0.8, eyes: 'glow', jaw, tilt: q.tilt });
      }
      ctx.globalAlpha = 1;
    }
    drawHead(ctx, this.id, p.x, p.y, p.s, { light: 1.05, eyes: 'glow', jaw, tilt: p.tilt, t });
    ctx.restore();

    // flashes
    if (!this.reduced) {
      if (t < 0.07 || (t > 0.32 && t < 0.37)) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      ctx.fillStyle = `rgba(160,0,0,${0.18 * Math.abs(Math.sin(t * 9))})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    } else {
      ctx.fillStyle = `rgba(0,0,0,${0.25 * Math.abs(Math.sin(t * 6))})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    this.fx.static(ctx, t, 0.08 + Math.max(0, (t - this.duration + 0.45) * 2.2));
    this.fx.vignette(ctx, 0.8);
  }
}
