// ---------------------------------------------------------------------------
// Drawing helpers shared by every renderer: offscreen canvases, colour maths,
// noise textures and a tiny pinhole-camera projector used to build the
// procedural 3D-ish rooms.
// ---------------------------------------------------------------------------

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Deterministic random for baked artwork, so rooms look the same every time.
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Parse #rrggbb into [r,g,b] */
export function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Darken (k<1) or lighten (k>1) a hex colour; returns css rgb() */
export function shade(c, k) {
  const [r, g, b] = hex(c);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function rgba(c, a) {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  const m = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Grey noise texture */
export function noiseCanvas(w, h, { seed = 1, alpha = 1, mono = true } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const rnd = seeded(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() * 255;
    img.data[i] = v;
    img.data[i + 1] = mono ? v : rnd() * 255;
    img.data[i + 2] = mono ? v : rnd() * 255;
    img.data[i + 3] = alpha * 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Fill a path given as an array of [x,y] */
export function poly(ctx, pts, fill, stroke, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

export function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

export function roundRect(ctx, x, y, w, h, r, fill, stroke, lw = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Random grime: dark blotches and drip streaks inside a rect */
export function grime(ctx, x, y, w, h, rnd, { count = 30, color = '0,0,0', strength = 0.25, drips = true } = {}) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const gx = x + rnd() * w, gy = y + rnd() * h;
    const r = 4 + rnd() * Math.min(w, h) * 0.12;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, `rgba(${color},${strength * rnd()})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  if (drips) {
    for (let i = 0; i < count / 3; i++) {
      const dx = x + rnd() * w, dy = y + rnd() * h * 0.5;
      const len = 20 + rnd() * h * 0.4;
      const g = ctx.createLinearGradient(dx, dy, dx, dy + len);
      g.addColorStop(0, `rgba(${color},${strength * 0.8})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(dx, dy, 1 + rnd() * 3, len);
    }
  }
  ctx.restore();
}

/** Radial light pool (additive) */
export function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * Darkness overlay builder: start fully dark, punch holes where light falls.
 * lights: [{x,y,r,strength(0..1), sx, sy (ellipse scale)}]
 */
export function darknessMap(w, h, baseAlpha, lights) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgba(0,0,0,${baseAlpha})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.scale(L.sx ?? 1, L.sy ?? 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L.r);
    g.addColorStop(0, `rgba(0,0,0,${L.strength})`);
    g.addColorStop(0.5, `rgba(0,0,0,${L.strength * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-L.r, -L.r, L.r * 2, L.r * 2);
    ctx.restore();
  }
  return c;
}

/**
 * Pinhole projector. World units are metres; X right, Y up, Z into the screen.
 * The camera sits at height camY looking down +Z; vy places the horizon.
 */
export class Persp {
  constructor({ vx, vy, F, camY }) {
    Object.assign(this, { vx, vy, F, camY });
  }
  p(X, Y, Z) {
    return [this.vx + (X * this.F) / Z, this.vy + ((this.camY - Y) * this.F) / Z];
  }
  /** px per metre at depth Z */
  scale(Z) {
    return this.F / Z;
  }
  quad(ctx, pts, fill, stroke, lw) {
    poly(ctx, pts.map(([x, y, z]) => this.p(x, y, z)), fill, stroke, lw);
  }
  /** Solid box with visible faces shaded (x,z = centre bottom-front-left corner) */
  box(ctx, x0, y0, z0, w, h, d, { top, front, side, stroke } = {}) {
    const x1 = x0 + w, y1 = y0 + h, z1 = z0 + d;
    // side faces: visible if on the respective side of the camera
    if (side) {
      if (x1 < 0) this.quad(ctx, [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], side, stroke);
      if (x0 > 0) this.quad(ctx, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], side, stroke);
    }
    if (top && y1 < this.camY) this.quad(ctx, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], top, stroke);
    if (front) this.quad(ctx, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], front, stroke);
  }
  /** Checkerboard on the floor plane between x0..x1 and z0..z1 */
  checker(ctx, x0, x1, z0, z1, tile, c1, c2, y = 0) {
    for (let z = z0; z < z1; z += tile) {
      const zz = Math.min(z1, z + tile);
      let i = Math.round(z / tile);
      for (let x = x0; x < x1; x += tile) {
        const xx = Math.min(x1, x + tile);
        this.quad(ctx, [[x, y, z], [xx, y, z], [xx, y, zz], [x, y, zz]], (i++ & 1) ? c1 : c2);
      }
    }
  }
  /** Room shell: floor, ceiling, side walls and back wall */
  room(ctx, { x0, x1, z0, z1, h, floor, ceiling, left, right, back }) {
    if (ceiling) this.quad(ctx, [[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]], ceiling);
    if (floor) this.quad(ctx, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], floor);
    if (left) this.quad(ctx, [[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]], left);
    if (right) this.quad(ctx, [[x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0]], right);
    if (back) this.quad(ctx, [[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]], back);
  }
  /** Gradient-shaded wall along x = const (gets darker with depth) */
  sideWall(ctx, x, z0, z1, h, colNear, colFar) {
    const [ax, ay] = this.p(x, h, z0);
    const [bx] = this.p(x, h, z1);
    const g = ctx.createLinearGradient(ax, ay, bx, ay);
    g.addColorStop(0, colNear);
    g.addColorStop(1, colFar);
    this.quad(ctx, [[x, 0, z0], [x, 0, z1], [x, h, z1], [x, h, z0]], g);
  }
  /** A flat rectangle on a side wall (posters, doors) */
  wallRect(ctx, x, z0, z1, y0, y1, fill, stroke) {
    this.quad(ctx, [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], fill, stroke);
  }
  /** A flat rectangle on a back wall at depth z */
  backRect(ctx, x0, x1, y0, y1, z, fill, stroke) {
    this.quad(ctx, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], fill, stroke);
  }
}
