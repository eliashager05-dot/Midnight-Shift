// ---------------------------------------------------------------------------
// Screen-space post effects: film grain, TV static, scanlines, vignette and
// rolling interference bars. Textures are generated once and reused.
// ---------------------------------------------------------------------------
import { VIEW_W, VIEW_H } from '../config.js';
import { makeCanvas, noiseCanvas } from './painter.js';

export class Effects {
  constructor() {
    this.noise = [1, 2, 3, 4, 5, 6].map((seed) => noiseCanvas(320, 180, { seed: seed * 977 }));
    this.scan = makeCanvas(VIEW_W, VIEW_H);
    const s = this.scan.getContext('2d');
    for (let y = 0; y < VIEW_H; y += 3) {
      s.fillStyle = 'rgba(0,0,0,0.38)';
      s.fillRect(0, y, VIEW_W, 1);
    }
    this.vig = makeCanvas(VIEW_W, VIEW_H);
    const v = this.vig.getContext('2d');
    const g = v.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.68);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    v.fillStyle = g;
    v.fillRect(0, 0, VIEW_W, VIEW_H);
    this.level = 'full';
  }

  setLevel(level) {
    this.level = level;
  }

  get grainMult() {
    return this.level === 'full' ? 1 : this.level === 'reduced' ? 0.5 : 0.15;
  }

  noiseFrame(t) {
    return this.noise[Math.floor(t * 30) % this.noise.length];
  }

  /** Fine film grain over the whole frame */
  grain(ctx, t, alpha = 0.07) {
    const a = alpha * this.grainMult;
    if (a <= 0.003) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = 'overlay';
    const n = this.noiseFrame(t);
    const ox = Math.random() * 60, oy = Math.random() * 40;
    ctx.drawImage(n, -ox, -oy, VIEW_W + 80, VIEW_H + 60);
    ctx.restore();
  }

  /** Heavy TV static (always shown, even with effects off: it is gameplay feedback) */
  static(ctx, t, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    const n = this.noiseFrame(t + 0.37);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(n, 0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  scanlines(ctx, alpha = 0.5) {
    if (this.level === 'off') return;
    ctx.save();
    ctx.globalAlpha = alpha * (this.level === 'reduced' ? 0.6 : 1);
    ctx.drawImage(this.scan, 0, 0);
    ctx.restore();
  }

  vignette(ctx, alpha = 0.85) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.vig, 0, 0);
    ctx.restore();
  }

  /** Slow rolling interference bar typical of cheap CCTV */
  rollingBar(ctx, t, alpha = 0.06) {
    if (this.level !== 'full') return;
    const y = ((t * 90) % (VIEW_H + 200)) - 100;
    const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(220,255,230,${alpha})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 60, VIEW_W, 120);
  }

  /** Horizontal tearing: shifts random strips of what's already drawn. */
  tear(ctx, canvas, strength = 1) {
    if (this.level === 'off') return;
    const strips = 2 + Math.floor(Math.random() * 4 * strength);
    for (let i = 0; i < strips; i++) {
      const y = Math.random() * VIEW_H;
      const h = 4 + Math.random() * 30;
      const dx = (Math.random() - 0.5) * 60 * strength;
      ctx.drawImage(canvas, 0, y, VIEW_W, h, dx, y, VIEW_W, h);
    }
  }
}
