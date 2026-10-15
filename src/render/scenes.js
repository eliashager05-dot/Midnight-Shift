// ---------------------------------------------------------------------------
// Camera room scenes. Each room is built once into an offscreen canvas using
// the Persp projector (a cheap fake-3D), plus a darkness overlay with light
// pools. Character "slots" give stable, readable positions on each feed.
// ---------------------------------------------------------------------------
import { makeCanvas, seeded, Persp, poly, ellipse, grime, darknessMap, shade, roundRect, rgba } from './painter.js';
import { drawHead, drawCharacter } from './characters.js';

export const SCENE_W = 1500;
export const SCENE_H = 720;

const C = {
  wall: '#3b4044', wallD: '#1e2225', wallWarm: '#45403a', floorA: '#34373a', floorB: '#111314',
  ceil: '#141618', trim: '#5a5040', wood: '#3a2e26', woodD: '#231b16', cloth: '#6c6c66', metal: '#55595c',
};

function text3d(ctx, P, str, X, Y, Z, size, color, font = 'Special Elite, Courier New, monospace') {
  const [x, y] = P.p(X, Y, Z);
  ctx.save();
  ctx.font = `${Math.round(size * P.scale(Z))}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** Simple ceiling lamp fixture */
function lamp(ctx, P, X, Z, h, on = true) {
  P.box(ctx, X - 0.5, h - 0.08, Z, 1.0, 0.08, 0.35, { front: on ? '#c8c8b0' : '#2a2a28', top: '#333' });
}

/** Wall-mounted poster with procedural content */
function poster(ctx, P, wallX, z0, z1, y0, y1, rnd, hue = '#6a4a3a', label = null) {
  P.wallRect(ctx, wallX, z0, z1, y0, y1, shade(hue, 0.9), 'rgba(0,0,0,0.6)');
  const zm = (z0 + z1) / 2, ym = (y0 + y1) / 2;
  const [cx, cy] = P.p(wallX, ym, zm);
  const s = P.scale(zm);
  // a faded smiling mascot face
  ellipse(ctx, cx, cy - s * 0.05, s * 0.18, s * 0.16, shade('#8a6a4a', 0.8 + rnd() * 0.2));
  ellipse(ctx, cx - s * 0.06, cy - s * 0.09, s * 0.03, s * 0.03, '#111');
  ellipse(ctx, cx + s * 0.06, cy - s * 0.09, s * 0.03, s * 0.03, '#111');
  if (label) {
    ctx.save();
    ctx.font = `${Math.max(6, s * 0.09)}px Special Elite, monospace`;
    ctx.fillStyle = 'rgba(220,210,180,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + s * 0.22);
    ctx.restore();
  }
}

/** Kid's crayon drawing on a wall */
function drawing(ctx, P, wallX, z0, z1, y0, y1, rnd) {
  P.wallRect(ctx, wallX, z0, z1, y0, y1, '#8c887a');
  const zm = (z0 + z1) / 2;
  const [cx, cy] = P.p(wallX, (y0 + y1) / 2, zm);
  const s = P.scale(zm) * 0.18;
  ctx.save();
  ctx.lineWidth = Math.max(1, s * 0.1);
  const cols = ['#6a2a2a', '#2a3a6a', '#3a5a2a', '#5a4a1a'];
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = cols[(i + Math.floor(rnd() * 4)) % 4];
    const fx = cx + (i - 1) * s * 0.9;
    ctx.beginPath();
    ctx.arc(fx, cy - s * 0.5, s * 0.3, 0, Math.PI * 2);
    ctx.moveTo(fx, cy - s * 0.2);
    ctx.lineTo(fx, cy + s * 0.5);
    ctx.moveTo(fx - s * 0.35, cy);
    ctx.lineTo(fx + s * 0.35, cy);
    ctx.stroke();
  }
  ctx.restore();
}

function corridorBase(ctx, P, { x0, x1, z0, z1, h, rnd, wallCol = C.wall, trimEvery = 0 }) {
  P.room(ctx, { x0, x1, z0, z1, h, ceiling: C.ceil, floor: C.floorB });
  P.checker(ctx, x0, x1, z0, z1, 0.55, C.floorA, C.floorB);
  P.sideWall(ctx, x0, z0, z1, h, shade(wallCol, 1.0), shade(wallCol, 0.35));
  P.sideWall(ctx, x1, z0, z1, h, shade(wallCol, 0.9), shade(wallCol, 0.3));
  // checkered wainscot band
  for (const wx of [x0, x1]) {
    for (let z = z0, i = 0; z < z1; z += 0.35, i++) {
      P.wallRect(ctx, wx, z, Math.min(z1, z + 0.35), 0.95, 1.12, i & 1 ? '#1a1a1a' : '#6a6a62');
    }
    P.wallRect(ctx, wx, z0, z1, 0, 0.12, '#151515');
  }
  // end wall
  P.backRect(ctx, x0, x1, 0, h, z1, shade(wallCol, 0.25));
  if (trimEvery) for (let z = z0 + 2; z < z1; z += trimEvery) lamp(ctx, P, 0, z, h, rnd() > 0.25);
}

// ---------------------------------------------------------------------------
// Scene definitions
// ---------------------------------------------------------------------------

const DEFS = {
  STAGE: {
    persp: { vx: 750, vy: 230, F: 800, camY: 2.6 },
    build(ctx, P, rnd) {
      P.room(ctx, { x0: -8, x1: 8, z0: 2, z1: 11, h: 4.4, ceiling: C.ceil, floor: C.floorB });
      P.checker(ctx, -8, 8, 2, 7.2, 0.9, C.floorA, C.floorB);
      P.sideWall(ctx, -8, 2, 11, 4.4, '#33302c', '#141210');
      P.sideWall(ctx, 8, 2, 11, 4.4, '#33302c', '#141210');
      // curtains on back wall: vertical folds
      const folds = 26;
      for (let i = 0; i < folds; i++) {
        const xa = -8 + (16 * i) / folds, xb = -8 + (16 * (i + 1)) / folds;
        P.backRect(ctx, xa, xb, 0.9, 4.4, 10.95, shade('#4c2232', 0.45 + 0.35 * Math.abs(Math.sin(i * 1.7))));
      }
      // scalloped valance
      P.backRect(ctx, -8, 8, 3.7, 4.4, 10.9, '#3a1a24');
      // banner
      P.backRect(ctx, -3.4, 3.4, 3.0, 3.6, 10.85, '#5e5034', 'rgba(0,0,0,0.5)');
      text3d(ctx, P, 'MORTIMER & FRIENDS', 0, 3.3, 10.85, 0.36, 'rgba(30,20,10,0.85)');
      // stars on the curtain
      for (let i = 0; i < 9; i++) {
        const [sx, sy] = P.p(-6 + rnd() * 12, 1.3 + rnd() * 1.6, 10.9);
        ctx.fillStyle = 'rgba(170,150,90,0.35)';
        star(ctx, sx, sy, 6 + rnd() * 6);
      }
      // stage platform
      P.box(ctx, -7, 0, 7.2, 14, 0.9, 3.8, { top: '#3a2c24', front: '#241a1c' });
      for (let x = -6.5; x < 7; x += 1.4) {
        const [sx, sy] = P.p(x, 0.45, 7.2);
        ctx.fillStyle = 'rgba(150,130,70,0.45)';
        star(ctx, sx, sy, 9);
      }
      // speakers
      P.box(ctx, -6.8, 0.9, 9.2, 0.9, 1.6, 0.6, { front: '#151515', top: '#222', side: '#101010' });
      P.box(ctx, 5.9, 0.9, 9.2, 0.9, 1.6, 0.6, { front: '#151515', top: '#222', side: '#101010' });
      for (const sxp of [-6.35, 6.35]) {
        const [cx, cy] = P.p(sxp, 1.9, 9.2);
        ellipse(ctx, cx, cy, 14, 14, '#050505');
        const [cx2, cy2] = P.p(sxp, 1.35, 9.2);
        ellipse(ctx, cx2, cy2, 9, 9, '#050505');
      }
      // party tables in the foreground
      table(ctx, P, -5.0, 4.6, rnd);
      table(ctx, P, 3.8, 4.4, rnd);
      grime(ctx, 0, 0, SCENE_W, SCENE_H, rnd, { count: 40, strength: 0.25 });
    },
    lights: (P) => [
      { pt: P.p(0, 1.6, 8.6), r: 340, strength: 0.85, sy: 1.3 },
      { pt: P.p(-2.5, 1.6, 8.8), r: 220, strength: 0.6, sy: 1.4 },
      { pt: P.p(2.5, 1.6, 8.8), r: 220, strength: 0.6, sy: 1.4 },
      { pt: P.p(0, 0, 4), r: 380, strength: 0.25 },
    ],
    dark: 0.82,
    slots: {
      bear: [{ X: 0, Y: 0.9, Z: 8.6 }],
      rabbit: [{ X: -2.5, Y: 0.9, Z: 8.8 }],
      bird: [{ X: 2.5, Y: 0.9, Z: 8.8 }],
    },
  },

  DINING: {
    persp: { vx: 750, vy: 215, F: 520, camY: 2.9 },
    build(ctx, P, rnd) {
      P.room(ctx, { x0: -9, x1: 9, z0: 2, z1: 14, h: 3.6, ceiling: C.ceil, floor: C.floorB });
      P.checker(ctx, -9, 9, 2, 14, 0.9, C.floorA, C.floorB);
      P.sideWall(ctx, -9, 2, 14, 3.6, '#3a3f42', '#141618');
      P.sideWall(ctx, 9, 2, 14, 3.6, '#3a3f42', '#141618');
      P.backRect(ctx, -9, 9, 0, 3.6, 14, '#24282a');
      // boarded windows
      for (const wx of [-6, -1, 4]) {
        P.backRect(ctx, wx, wx + 2, 1.2, 2.6, 13.95, '#0a0c0e');
        for (let b = 0; b < 3; b++) P.backRect(ctx, wx - 0.1, wx + 2.1, 1.4 + b * 0.45, 1.6 + b * 0.45, 13.9, shade(C.wood, 0.9 + rnd() * 0.3));
      }
      // posters on walls
      poster(ctx, P, -9, 5, 6.2, 1.4, 2.6, rnd, '#5a3a32', 'SMILE!');
      poster(ctx, P, 9, 6, 7.2, 1.4, 2.6, rnd, '#3a4a5a', 'PARTY TIME');
      // party flag strings
      for (let z = 5; z <= 12; z += 3.5) {
        let prev = null;
        for (let x = -9; x <= 9; x += 0.6) {
          const sag = 0.5 * (1 - Math.pow(x / 9, 2));
          const pt = P.p(x, 3.4 - sag, z);
          if (prev) {
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(pt[0], pt[1]);
            ctx.stroke();
            const s = P.scale(z) * 0.18;
            poly(ctx, [prev, pt, [(prev[0] + pt[0]) / 2, (prev[1] + pt[1]) / 2 + s]], ['#6a3030', '#304a6a', '#6a6030', '#306a4a'][Math.floor(rnd() * 4)]);
          }
          prev = pt;
        }
      }
      // long tables
      for (const tx of [-4.4, 2.4]) {
        for (let z = 11; z >= 3.5; z -= 1.5) {
          chair(ctx, P, tx - 0.55, z + 0.3);
          chair(ctx, P, tx + 2.15, z + 0.3);
        }
        P.box(ctx, tx, 0, 3.5, 2, 0.78, 8, { top: '#5c5c58', front: '#2c2c2a', side: '#262624' });
        for (let z = 4; z < 11.5; z += 1.3) {
          const [hx, hy] = P.p(tx + 0.5 + rnd(), 0.78, z);
          const s = P.scale(z);
          poly(ctx, [[hx - s * 0.1, hy], [hx + s * 0.1, hy], [hx, hy - s * 0.3]], ['#6a3a3a', '#3a4a6a', '#6a5a2a'][Math.floor(rnd() * 3)]);
        }
      }
      grime(ctx, 0, 0, SCENE_W, SCENE_H, rnd, { count: 50, strength: 0.3 });
    },
    lights: (P) => [
      { pt: P.p(0, 0, 5), r: 300, strength: 0.6, sx: 1.6 },
      { pt: P.p(0, 0, 9), r: 220, strength: 0.45, sx: 1.6 },
      { pt: P.p(5, 1, 7), r: 160, strength: 0.4 },
      { pt: P.p(-5, 1, 7.5), r: 160, strength: 0.4 },
    ],
    dark: 0.86,
    slots: {
      bear: [{ X: 0.1, Z: 10.5 }, { X: -7.2, Z: 12.8, dark: true }, { X: 7.4, Z: 12.4, dark: true }],
      rabbit: [{ X: -5.6, Z: 7.4 }, { X: -0.9, Z: 7.8 }, { X: -1.2, Z: 4.6 }],
      bird: [{ X: 1.2, Z: 6.4 }, { X: 3.4, Z: 7.6 }, { X: 1.3, Z: 9.5 }],
    },
  },

  WEST: {
    persp: { vx: 700, vy: 245, F: 620, camY: 2.5 },
    build(ctx, P, rnd) {
      corridorBase(ctx, P, { x0: -1.6, x1: 1.6, z0: 1.4, z1: 18, h: 2.9, rnd, trimEvery: 4 });
      // storage door on the left wall
      P.wallRect(ctx, -1.6, 7, 8.2, 0, 2.2, '#0b0c0d', '#2a2a2a');
      text3d(ctx, P, 'STORAGE', -1.55, 2.35, 7.6, 0.14, 'rgba(180,170,140,0.5)');
      poster(ctx, P, -1.6, 3, 4.2, 1.3, 2.3, rnd, '#4a3a5a', 'HOP TO IT!');
      poster(ctx, P, 1.6, 4.5, 5.7, 1.3, 2.3, rnd, '#5a4a32', 'BE NICE');
      poster(ctx, P, 1.6, 10, 11, 1.3, 2.2, rnd, '#3a3a3a', 'MISSING');
      // end doorway
      P.backRect(ctx, -0.8, 0.8, 0, 2.2, 17.95, '#050606');
      grime(ctx, 0, 0, SCENE_W, SCENE_H, rnd, { count: 50, strength: 0.35 });
    },
    lights: (P) => [
      { pt: P.p(0, 0.6, 3), r: 260, strength: 0.65, sx: 1.4 },
      { pt: P.p(0, 1.2, 6), r: 170, strength: 0.55 },
      { pt: P.p(0, 1.3, 10), r: 110, strength: 0.45 },
      { pt: P.p(0, 1.3, 14), r: 60, strength: 0.3 },
    ],
    dark: 0.88,
    slots: {
      rabbit: [{ X: 0.4, Z: 12 }, { X: -0.6, Z: 5.4 }, { X: 0.7, Z: 8.0 }],
      bear: [{ X: 0.4, Z: 9 }, { X: 0.6, Z: 15.5, dark: true }],
    },
  },

  EAST: {
    persp: { vx: 800, vy: 245, F: 620, camY: 2.5 },
    build(ctx, P, rnd) {
      corridorBase(ctx, P, { x0: -1.6, x1: 1.6, z0: 1.4, z1: 18, h: 2.9, rnd, wallCol: '#3a3e3a', trimEvery: 4 });
      for (let i = 0; i < 6; i++) drawing(ctx, P, i & 1 ? 1.6 : -1.6, 2.5 + i * 1.6, 3.4 + i * 1.6, 1.4, 2.1, rnd);
      poster(ctx, P, 1.6, 12, 13.2, 1.3, 2.3, rnd, '#2a4a3a', 'SNACK TIME!');
      // wet floor sign
      const [wx, wy] = P.p(-1.0, 0, 4.2);
      const s = P.scale(4.2);
      poly(ctx, [[wx - s * 0.2, wy], [wx + s * 0.2, wy], [wx + s * 0.05, wy - s * 0.65], [wx - s * 0.05, wy - s * 0.65]], '#6a6024');
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = `${Math.round(s * 0.09)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('CAUTION', wx, wy - s * 0.35);
      P.backRect(ctx, -0.8, 0.8, 0, 2.2, 17.95, '#050606');
      grime(ctx, 0, 0, SCENE_W, SCENE_H, rnd, { count: 50, strength: 0.35 });
    },
    lights: (P) => [
      { pt: P.p(0, 0.6, 3), r: 250, strength: 0.6, sx: 1.4 },
      { pt: P.p(0, 1.2, 6), r: 170, strength: 0.5 },
      { pt: P.p(0, 1.3, 10), r: 110, strength: 0.4 },
    ],
    dark: 0.88,
    flicker: true,
    slots: {
      bird: [{ X: -0.3, Z: 11 }, { X: 0.5, Z: 5.2 }, { X: -0.5, Z: 7.6 }],
      bear: [{ X: -0.4, Z: 8.5 }, { X: -0.7, Z: 15, dark: true }],
    },
  },

  KITCHEN: {
    persp: { vx: 750, vy: 230, F: 520, camY: 2.6 },
    build(ctx, P, rnd) {
      P.room(ctx, { x0: -5, x1: 5, z0: 2, z1: 10, h: 3, ceiling: C.ceil, floor: C.floorB });
      P.checker(ctx, -5, 5, 2, 10, 0.5, '#2c2e2c', '#1a1c1a');
      P.sideWall(ctx, -5, 2, 10, 3, '#4a4c48', '#1a1c1a');
      P.sideWall(ctx, 5, 2, 10, 3, '#4a4c48', '#1a1c1a');
      // tiled back wall
      for (let y = 0; y < 3; y += 0.3) for (let x = -5; x < 5; x += 0.3) {
        P.backRect(ctx, x, x + 0.29, y, y + 0.29, 10, shade('#5a5c56', 0.55 + rnd() * 0.25));
      }
      // counters left
      P.box(ctx, -5, 0, 3, 0.95, 0.95, 6, { top: '#6a6c68', side: '#2a2c2a', front: '#3a3c3a' });
      // stove + hood on back wall
      P.box(ctx, -1.6, 0, 9.2, 2.4, 0.95, 0.8, { top: '#2a2a2a', front: '#3a3a38' });
      for (const bx of [-1.1, 0.2]) {
        const [cx, cy] = P.p(bx + 0.2, 0.95, 9.6);
        ellipse(ctx, cx, cy, 14, 5, '#111');
      }
      P.box(ctx, -1.8, 2.1, 9.4, 2.8, 0.6, 0.6, { front: '#4a4a48', side: '#2a2a2a' });
      // big fridge right
      P.box(ctx, 3.6, 0, 7.4, 1.3, 2.3, 1.2, { front: '#6a6c66', side: '#3a3c38', top: '#555' });
      const [hx, hy] = P.p(3.75, 1.4, 7.4);
      roundRect(ctx, hx, hy, 4, 40, 2, '#222');
      // hanging pots from a rack
      for (let i = 0; i < 6; i++) {
        const X = -2 + i * 0.75, Z = 6;
        const [ax, ay] = P.p(X, 3, Z), [bx, by] = P.p(X, 2.2 - (i % 2) * 0.2, Z);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ellipse(ctx, bx, by + 14, 18 - (i % 3) * 3, 16, shade('#5a5650', 0.7 + rnd() * 0.4));
      }
      text3d(ctx, P, 'EMPLOYEES MUST WASH HANDS', 0, 2.6, 9.98, 0.14, 'rgba(200,200,180,0.35)');
      grime(ctx, 0, 0, SCENE_W, SCENE_H, rnd, { count: 70, strength: 0.4 });
    },
    lights: (P) => [
      { pt: P.p(0, 1, 6), r: 260, strength: 0.6, sx: 1.5 },
      { pt: P.p(4.2, 1.5, 7.4), r: 120, strength: 0.45 },
      { pt: P.p(-1, 1, 8.5), r: 160, strength: 0.4 },
    ],
    dark: 0.86,
    degraded: true,
    slots: {
      bird: [{ X: 1.3, Z: 6.2 }, { X: -1.8, Z: 7.6 }, { X: 0.2, Z: 4.6 }],
      bear: [{ X: -0.4, Z: 8.6 }, { X: 2.4, Z: 9.2, dark: true }],
    },
  },

  STORAGE: {
    persp: { vx: 750, vy: 250, F: 560, camY: 2.4 },
    build(ctx, P, rnd) {
      P.room(ctx, { x0: -4, x1: 4, z0: 1.8, z1: 8, h: 2.8, ceiling: C.ceil, floor: C.floorB });
      P.checker(ctx, -4, 4, 1.8, 8, 0.6, '#2a2c2c', '#141515');
      P.sideWall(ctx, -4, 1.8, 8, 2.8, '#3a3632', '#181614');
      P.sideWall(ctx, 4, 1.8, 8, 2.8, '#3a3632', '#181614');
      P.backRect(ctx, -4, 4, 0, 2.8, 8, '#2a2622');
      // alcove frame (the curtain itself is drawn live)
      P.backRect(ctx, -1.7, 1.7, 0, 2.5, 7.98, '#050505');
      P.backRect(ctx, -1.85, 1.85, 2.4, 2.65, 7.96, '#3a2a2a');
      // shelves with boxes
      for (const sx of [-3.9, 2.7]) {
        for (let y = 0.4; y < 2.4; y += 0.7) {
          P.box(ctx, sx, y, 3, 1.2, 0.05, 3.8, { top: '#3a3028', front: '#2a221c' });
          for (let z = 3.2; z < 6.5; z += 0.9) {
            const w = 0.4 + rnd() * 0.4;
            P.box(ctx, sx + 0.1 + rnd() * 0.3, y + 0.05, z, w, 0.3 + rnd() * 0.25, 0.6, { front: shade('#6a5a42', 0.5 + rnd() * 0.4), top: '#4a3e2e', side: '#2e261c' });
          }
        }
      }
      // crates in the foreground
      P.box(ctx, -2.6, 0, 2.6, 1.0, 0.8, 0.9, { front: '#4a3c2a', top: '#5a4a34', side: '#2e2418' });
      P.box(ctx, -2.4, 0.8, 2.75, 0.7, 0.55, 0.7, { front: '#3e3224', top: '#504030', side: '#2a2016' });
      // OUT OF ORDER sign on an easel
      const [ex, ey] = P.p(1.95, 0, 5.6);
      const s = P.scale(5.6);
      ctx.strokeStyle = '#2a2018';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ex - s * 0.25, ey);
      ctx.lineTo(ex, ey - s * 1.2);
      ctx.lineTo(ex + s * 0.25, ey);
      ctx.stroke();
      ctx.save();
      ctx.translate(ex, ey - s * 0.85);
      ctx.rotate(-0.06);
      roundRect(ctx, -s * 0.42, -s * 0.24, s * 0.84, s * 0.48, 3, '#8a8270');
      ctx.fillStyle = 'rgba(70,20,20,0.85)';
      ctx.font = `bold ${Math.round(s * 0.11)}px Special Elite, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('SORRY!', 0, -s * 0.06);
      ctx.fillText('OUT OF ORDER', 0, s * 0.1);
      ctx.restore();
      grime(ctx, 0, 0, SCENE_W, SCENE_H, rnd, { count: 60, strength: 0.35 });
    },
    lights: (P) => [
      { pt: P.p(0, 1.2, 7.6), r: 230, strength: 0.55, sy: 1.4 },
      { pt: P.p(1.9, 1, 5.6), r: 120, strength: 0.5 },
      { pt: P.p(0, 0, 3), r: 260, strength: 0.25 },
    ],
    dark: 0.86,
    slots: {},
    /** Curtain + Scraps, drawn every frame depending on his stage. */
    dynamic(ctx, P, { session, t, light }) {
      const runner = session.byId.runner;
      const stage = runner.state === 'CHARGING' ? 3 : runner.stage;
      const Z = 7.7;
      const [fx, fy] = P.p(0, 0, Z);
      const s = (P.scale(Z) * 2.05) / 420;
      if (stage === 1) drawCharacter(ctx, 'runner', fx + P.scale(Z) * 0.35, fy, s, { light: 0.55 * light, eyes: 'glow', t, tilt: -0.25, twitch: 1 });
      if (stage === 2) drawCharacter(ctx, 'runner', fx, fy, s, { light: 0.7 * light, eyes: 'glow', t, pose: 'lean', jaw: 0.35, twitch: 1 });
      // curtains: gap widens with stage
      const gap = [0.06, 0.55, 1.35, 1.65][stage];
      const sway = Math.sin(t * 0.8) * 0.03;
      for (const side of [-1, 1]) {
        const inner = side * (gap + sway), outer = side * 1.75;
        const folds = 7;
        for (let i = 0; i < folds; i++) {
          const a = inner + ((outer - inner) * i) / folds, b = inner + ((outer - inner) * (i + 1)) / folds;
          P.backRect(ctx, Math.min(a, b), Math.max(a, b), 0, 2.45, 7.9, shade('#4a2a4e', 0.35 + 0.3 * Math.abs(Math.sin(i * 1.9 + side))));
        }
      }
      // eyes glinting through the gap when hidden
      if (stage === 0 && Math.sin(t * 0.7) > 0.6) {
        const [gx, gy] = P.p(0, 1.75, Z);
        ctx.save();
        ctx.shadowColor = '#ffd27a';
        ctx.shadowBlur = 8;
        ellipse(ctx, gx - 3, gy, 1.8, 1.4, 'rgba(255,210,122,0.75)');
        ctx.restore();
      }
    },
  },

  BACKSTAGE: {
    persp: { vx: 750, vy: 240, F: 540, camY: 2.4 },
    build(ctx, P, rnd) {
      P.room(ctx, { x0: -4.5, x1: 4.5, z0: 1.6, z1: 8, h: 2.8, ceiling: C.ceil, floor: C.floorB });
      P.checker(ctx, -4.5, 4.5, 1.6, 8, 0.6, '#2a2a2a', '#121212');
      P.sideWall(ctx, -4.5, 1.6, 8, 2.8, '#34383a', '#141616');
      P.sideWall(ctx, 4.5, 1.6, 8, 2.8, '#34383a', '#141616');
      P.backRect(ctx, -4.5, 4.5, 0, 2.8, 8, '#222628');
      // shelves of spare heads
      for (let row = 0; row < 2; row++) {
        const y = 1.0 + row * 0.85;
        P.box(ctx, -4, y, 7.3, 8, 0.06, 0.6, { top: '#3a3028', front: '#241c16' });
        const ids = ['bear', 'rabbit', 'bird', null, 'bear', 'runner', null, 'rabbit'];
        for (let i = 0; i < 8; i++) {
          const X = -3.5 + i * 1.0;
          const [hx, hy] = P.p(X, y + 0.33, 7.5);
          const s = (P.scale(7.5) * 0.55) / 150;
          const id = ids[(i + row * 3) % ids.length];
          if (id) drawHead(ctx, id, hx, hy, s, { light: 0.55, eyes: 'off', jaw: rnd() * 0.5, tilt: (rnd() - 0.5) * 0.4 });
          else {
            // blank faceplate
            ellipse(ctx, hx, hy, 30 * s * 2.2, 34 * s * 2.2, '#8a8478');
            ellipse(ctx, hx - 12 * s * 2.2, hy - 6 * s * 2.2, 6 * s * 2.2, 5 * s * 2.2, '#0a0a0a');
            ellipse(ctx, hx + 12 * s * 2.2, hy - 6 * s * 2.2, 6 * s * 2.2, 5 * s * 2.2, '#0a0a0a');
          }
        }
      }
      // workbench with parts
      P.box(ctx, 2.0, 0, 3.5, 2.2, 0.9, 1.2, { top: '#3e342a', front: '#2a221a', side: '#1e1812' });
      for (let i = 0; i < 8; i++) {
        const [ax, ay] = P.p(2.2 + rnd() * 1.8, 0.92, 3.6 + rnd());
        ctx.strokeStyle = '#6a6e70';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (rnd() - 0.5) * 50, ay - rnd() * 10);
        ctx.stroke();
      }
      // a slumped endoskeleton in the corner
      const [kx, ky] = P.p(-3.3, 0, 4.2);
      const ks = P.scale(4.2) / 420;
      ctx.strokeStyle = '#4a4e50';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(kx, ky - 180 * ks);
      ctx.lineTo(kx + 10 * ks, ky - 330 * ks);
      ctx.moveTo(kx - 60 * ks, ky);
      ctx.lineTo(kx, ky - 180 * ks);
      ctx.lineTo(kx + 70 * ks, ky);
      ctx.stroke();
      ellipse(ctx, kx + 14 * ks, ky - 380 * ks, 50 * ks, 55 * ks, '#3a3e40');
      ellipse(ctx, kx - 4 * ks, ky - 390 * ks, 12 * ks, 10 * ks, '#000');
      ellipse(ctx, kx + 32 * ks, ky - 390 * ks, 12 * ks, 10 * ks, '#000');
      grime(ctx, 0, 0, SCENE_W, SCENE_H, rnd, { count: 50, strength: 0.35 });
    },
    lights: (P) => [
      { pt: P.p(0, 1.6, 6), r: 300, strength: 0.6, sy: 1.1 },
      { pt: P.p(2.8, 1, 4), r: 160, strength: 0.35 },
    ],
    dark: 0.84,
    slots: {
      rabbit: [{ X: 1.0, Z: 3.4, pose: 'lean' }, { X: -1.6, Z: 6 }],
    },
  },

  SERVICE: {
    persp: { vx: 720, vy: 235, F: 600, camY: 2.5 },
    build(ctx, P, rnd) {
      corridorBase(ctx, P, { x0: -1.3, x1: 1.3, z0: 1.4, z1: 16, h: 2.7, rnd, wallCol: '#3c3a36', trimEvery: 0 });
      // pipes along the right wall and ceiling
      for (const [X, Y, w, col] of [[1.15, 2.35, 0.09, '#4a4a46'], [1.05, 2.1, 0.06, '#5a3a2a'], [-0.6, 2.62, 0.08, '#3a4248']]) {
        const [ax, ay] = P.p(X, Y, 1.4), [bx, by] = P.p(X, Y, 16);
        const g = ctx.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, col);
        g.addColorStop(1, '#101010');
        poly(ctx, [[ax, ay - P.scale(1.4) * w], [bx, by - P.scale(16) * w], [bx, by + P.scale(16) * w], [ax, ay + P.scale(1.4) * w]], g);
      }
      // cage lamps
      for (const Z of [4, 9, 14]) {
        const [lx, ly] = P.p(0, 2.55, Z);
        const s = P.scale(Z) * 0.12;
        ellipse(ctx, lx, ly, s, s * 0.8, '#b8b498');
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(lx - s, ly - s * 0.8, s * 2, s * 1.6);
      }
      // exit sign at the far end
      P.backRect(ctx, -0.4, 0.4, 2.15, 2.4, 15.95, '#3a0e0e');
      text3d(ctx, P, 'EXIT', 0, 2.27, 15.95, 0.18, 'rgba(220,60,50,0.9)');
      P.backRect(ctx, -0.7, 0.7, 0, 2.05, 15.95, '#0b0b0b');
      // mop bucket
      P.box(ctx, -1.15, 0, 3.0, 0.45, 0.45, 0.45, { front: '#5a5420', top: '#2a2810', side: '#3a3614' });
      grime(ctx, 0, 0, SCENE_W, SCENE_H, rnd, { count: 60, strength: 0.4 });
    },
    lights: (P) => [
      { pt: P.p(0, 1.2, 4), r: 200, strength: 0.55 },
      { pt: P.p(0, 1.2, 9), r: 120, strength: 0.45 },
      { pt: P.p(0, 2.2, 15.9), r: 60, strength: 0.4 },
    ],
    dark: 0.88,
    slots: {
      bird: [{ X: -0.3, Z: 7.5 }, { X: 0.35, Z: 4.4 }],
      bear: [{ X: 0.3, Z: 11 }, { X: -0.4, Z: 14.2, dark: true }],
    },
  },
};

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i & 1 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function chair(ctx, P, X, Z) {
  P.box(ctx, X, 0, Z, 0.4, 0.45, 0.4, { top: '#3a3430', front: '#1e1a18', side: '#181412' });
  P.box(ctx, X, 0.45, Z + 0.35, 0.4, 0.5, 0.05, { front: '#2a2420' });
}

function table(ctx, P, X, Z, rnd) {
  P.box(ctx, X, 0, Z, 1.4, 0.75, 1.0, { top: '#5c5c58', front: '#2c2c2a', side: '#222' });
  const [hx, hy] = P.p(X + 0.7, 0.75, Z + 0.5);
  const s = P.scale(Z);
  poly(ctx, [[hx - s * 0.09, hy], [hx + s * 0.09, hy], [hx, hy - s * 0.28]], rnd() > 0.5 ? '#6a3a3a' : '#3a4a6a');
}

/** Build every scene once. Returns { [room]: {base, dark, P, def} } */
export function buildScenes() {
  const out = {};
  let seed = 11;
  for (const [room, def] of Object.entries(DEFS)) {
    const base = makeCanvas(SCENE_W, SCENE_H);
    const ctx = base.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    const P = new Persp(def.persp);
    const rnd = seeded(seed++ * 7919);
    def.build(ctx, P, rnd);
    // Global exposure: the feeds must stay readable through the CCTV grade.
    const lights = def.lights(P).map((l) => ({ x: l.pt[0], y: l.pt[1], r: l.r * 1.25, strength: Math.min(1, l.strength * 1.35), sx: l.sx, sy: l.sy }));
    const dark = darknessMap(SCENE_W, SCENE_H, def.dark * 0.72, lights);
    out[room] = { base, dark, P, def };
  }
  return out;
}

export { rgba };
