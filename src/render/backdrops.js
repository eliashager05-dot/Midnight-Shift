// ---------------------------------------------------------------------------
// Animated backdrops for non-gameplay screens: main menu, game over, victory.
// ---------------------------------------------------------------------------
import { VIEW_W, VIEW_H } from '../config.js';
import { drawCharacter, drawHead, CHARACTER_IDS } from './characters.js';
import { glow, poly } from './painter.js';

export class MenuBackdrop {
  constructor(effects) {
    this.fx = effects;
    this.char = 'bear';
    this.glitch = 0;
    this.nextGlitch = 4;
    this.lamp = 1;
    this.flick = 0;
  }

  render(ctx, t, dt) {
    // lamp flicker
    this.flick -= dt;
    if (this.flick <= 0) {
      this.lamp = Math.random() < 0.12 ? 0.15 + Math.random() * 0.3 : 0.85 + Math.random() * 0.15;
      this.flick = this.lamp < 0.5 ? 0.05 + Math.random() * 0.12 : 0.3 + Math.random() * 2.2;
    }
    this.nextGlitch -= dt;
    if (this.nextGlitch <= 0) {
      this.glitch = 0.25 + Math.random() * 0.35;
      this.nextGlitch = 4 + Math.random() * 7;
      this.char = CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)];
    }
    this.glitch = Math.max(0, this.glitch - dt);

    ctx.fillStyle = '#030405';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // floor hint
    const fg = ctx.createLinearGradient(0, 560, 0, VIEW_H);
    fg.addColorStop(0, 'rgba(30,36,40,0)');
    fg.addColorStop(1, 'rgba(30,36,40,0.5)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 560, VIEW_W, 160);

    // hanging bulb and cone
    const bx = 930, by = 120, sway = Math.sin(t * 0.7) * 12;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.lineTo(bx + sway, by);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cone = ctx.createLinearGradient(0, by, 0, VIEW_H);
    cone.addColorStop(0, `rgba(210,220,200,${0.13 * this.lamp})`);
    cone.addColorStop(1, 'rgba(210,220,200,0)');
    poly(ctx, [[bx + sway - 10, by], [bx + sway + 10, by], [bx + sway * 2 + 260, VIEW_H], [bx + sway * 2 - 260, VIEW_H]], cone);
    glow(ctx, bx + sway, by + 4, 30, '#e8f0e0', 0.7 * this.lamp);
    ctx.restore();

    // the figure standing under the light
    const showEyes = this.glitch > 0 || Math.sin(t * 0.37) > 0.92;
    drawCharacter(ctx, this.char, bx + sway * 0.4, 690, 1.3, {
      light: 0.14 * this.lamp + (this.glitch > 0 ? 0.25 : 0),
      eyes: showEyes ? 'glow' : 'off',
      t,
      twitch: 1,
      tilt: Math.sin(t * 0.5) * 0.06,
    });

    // darkness falloff around the light
    const dg = ctx.createRadialGradient(bx, 420, 120, bx, 420, 780);
    dg.addColorStop(0, 'rgba(0,0,0,0)');
    dg.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (this.lamp < 0.5) {
      ctx.fillStyle = `rgba(0,0,0,${0.7 - this.lamp})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.glitch > 0) {
      this.fx.tear(ctx, ctx.canvas, 1.2);
      this.fx.static(ctx, t, 0.25);
      ctx.font = '30px VT323, monospace';
      ctx.fillStyle = 'rgba(220,235,220,0.8)';
      ctx.fillText('CAM 01  ●REC', 40, 50);
    }
    this.fx.grain(ctx, t, 0.12);
    this.fx.static(ctx, t, 0.035);
    this.fx.scanlines(ctx, 0.35);
    this.fx.vignette(ctx, 0.95);
  }
}

export class GameOverBackdrop {
  constructor(effects) {
    this.fx = effects;
  }
  render(ctx, t, killer) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (killer) {
      // a mangled view of the culprit drifting in the static
      const flick = Math.sin(t * 3) * Math.sin(t * 1.7) > 0.2;
      if (flick) drawHead(ctx, killer, 920 + Math.sin(t * 0.4) * 10, 330, 2.0, { light: 0.25, eyes: 'glow', jaw: 0.4, tilt: 0.2 + Math.sin(t) * 0.05 });
    }
    this.fx.static(ctx, t, 0.35 + 0.1 * Math.sin(t * 5));
    this.fx.scanlines(ctx, 0.5);
    this.fx.vignette(ctx, 0.95);
  }
}

export class DawnBackdrop {
  constructor(effects) {
    this.fx = effects;
  }
  render(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    const k = Math.min(1, t / 6);
    g.addColorStop(0, `rgb(${Math.round(4 + 20 * k)},${Math.round(5 + 18 * k)},${Math.round(8 + 22 * k)})`);
    g.addColorStop(1, `rgb(${Math.round(10 + 50 * k)},${Math.round(8 + 32 * k)},${Math.round(6 + 18 * k)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.fx.grain(ctx, t, 0.1);
    this.fx.vignette(ctx, 0.9);
  }
}
