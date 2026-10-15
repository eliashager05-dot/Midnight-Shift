// ---------------------------------------------------------------------------
// Procedural animatronic artwork. All four characters are drawn with canvas
// primitives in a local coordinate space (feet at y=0, ~420 units tall) so
// they can be placed at any scale in cameras, doorways and jumpscares.
//
// Options (o):
//   light  0..1.4  brightness multiplier (how lit the character is)
//   jaw    0..1    how far the jaw hangs open
//   eyes   'glow' | 'dim' | 'off' | 'white'
//   t      time in seconds (twitch / idle motion)
//   pose   'stand' | 'lean' | 'run' | 'slump'
// ---------------------------------------------------------------------------
import { shade, ellipse, poly, roundRect } from './painter.js';

const TAU = Math.PI * 2;

/** Radial-shaded fill: light from upper left. */
function rg(ctx, cx, cy, r, base, L) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.15);
  g.addColorStop(0, shade(base, 1.25 * L));
  g.addColorStop(0.6, shade(base, 0.85 * L));
  g.addColorStop(1, shade(base, 0.4 * L));
  return g;
}

function eye(ctx, x, y, r, o, color = '#e8f4ff', socketCol = '#060505') {
  ellipse(ctx, x, y, r, r * 0.85, socketCol);
  if (o.eyes === 'off') return;
  const pr = o.eyes === 'white' ? r * 0.75 : r * 0.28;
  ctx.save();
  if (o.eyes === 'glow') {
    ctx.shadowColor = color;
    ctx.shadowBlur = r * 2.2;
  }
  const c = o.eyes === 'dim' ? shade(color.length === 7 ? color : '#cccccc', 0.35 + 0.4 * (o.light ?? 1)) : color;
  ellipse(ctx, x + (o.look ?? 0) * r * 0.3, y, pr, pr, c);
  if (o.eyes === 'white') ellipse(ctx, x + (o.look ?? 0) * r * 0.4, y, r * 0.16, r * 0.16, '#050505');
  ctx.restore();
}

function teeth(ctx, x0, x1, y, h, n, col, down = true) {
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const tx = x0 + i * w;
    poly(ctx, down ? [[tx + 1, y], [tx + w - 1, y], [tx + w / 2, y + h]] : [[tx + 1, y], [tx + w - 1, y], [tx + w / 2, y - h]], col);
  }
}

function stitches(ctx, pts, col, L) {
  ctx.strokeStyle = shade(col, L);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    ctx.moveTo(mx - 5, my - 5);
    ctx.lineTo(mx + 5, my + 5);
  }
  ctx.stroke();
}

function wires(ctx, x, y, L, n = 4, len = 40, seed = 1) {
  const cols = ['#7a2a22', '#2a4a7a', '#7a6a22', '#333333'];
  ctx.lineWidth = 2.5;
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = shade(cols[(i + seed) % cols.length], L);
    ctx.beginPath();
    ctx.moveTo(x + i * 5, y);
    ctx.bezierCurveTo(x + i * 6 - 10, y + len * 0.4, x + i * 4 + 15, y + len * 0.7, x + i * 7 - 5, y + len);
    ctx.stroke();
  }
}

// ── MORTIMER (bear) ─────────────────────────────────────────────────────────
const BEAR = { fur: '#6b4a33', furD: '#4a3222', belly: '#a07a55', muzzle: '#b08a62', nose: '#1a0f0a', vest: '#2e3a4e', brass: '#a08440', hat: '#8a7a2a', hat2: '#5a2a2a' };

function bearHead(ctx, o) {
  const L = o.light ?? 1, P = BEAR;
  // ears
  for (const sx of [-1, 1]) {
    ellipse(ctx, sx * 62, -62, 28, 27, rg(ctx, sx * 62, -62, 28, P.fur, L));
    ellipse(ctx, sx * 62, -60, 15, 14, shade(P.furD, L * 0.8));
  }
  // head
  ellipse(ctx, 0, 0, 80, 72, rg(ctx, 0, 0, 80, P.fur, L));
  // brows
  poly(ctx, [[-52, -36], [-10, -28], [-12, -20], [-50, -26]], shade(P.furD, L * 0.7));
  poly(ctx, [[52, -40], [10, -28], [12, -20], [50, -30]], shade(P.furD, L * 0.7));
  // eyes (left lid droops)
  eye(ctx, -30, -12, 15, o, '#cfe6ff');
  eye(ctx, 30, -12, 15, o, '#cfe6ff');
  poly(ctx, [[-46, -24], [-14, -22], [-14, -12], [-46, -10]], shade(P.fur, L * 0.9));
  // mouth interior + jaw
  const jo = (o.jaw ?? 0) * 46;
  ellipse(ctx, 0, 34 + jo * 0.45, 40, 12 + jo * 0.55, '#0a0504');
  teeth(ctx, -30, 30, 28, 9, 7, shade('#c8c0a8', L));
  // lower jaw
  ctx.save();
  ctx.translate(0, jo);
  ellipse(ctx, 0, 48, 44, 18, rg(ctx, 0, 48, 44, P.muzzle, L * 0.85));
  teeth(ctx, -28, 28, 38, 8, 6, shade('#b8b098', L), false);
  ctx.restore();
  // muzzle + nose
  ellipse(ctx, 0, 22, 44, 26, rg(ctx, 0, 22, 44, P.muzzle, L));
  ellipse(ctx, 0, 8, 15, 10, shade(P.nose, L + 0.2));
  ellipse(ctx, -4, 5, 5, 3, shade('#555555', L));
  // torn party hat
  ctx.save();
  ctx.translate(30, -66);
  ctx.rotate(0.35);
  poly(ctx, [[-22, 0], [22, 0], [4, -58]], shade(P.hat, L * 0.8));
  poly(ctx, [[-14, -18], [14, -18], [10, -28], [-10, -28]], shade(P.hat2, L));
  poly(ctx, [[4, -58], [10, -40], [0, -44]], shade('#000000', 1));
  ctx.restore();
  // stain / tear on cheek
  ellipse(ctx, 50, 18, 14, 9, 'rgba(20,8,4,0.55)');
  stitches(ctx, [[-62, 10], [-46, 30], [-40, 52]], '#20140c', L);
}

function bearBody(ctx, o) {
  const L = o.light ?? 1, P = BEAR;
  roundRect(ctx, -78, -125, 60, 125, 24, rg(ctx, -48, -60, 60, P.furD, L));
  roundRect(ctx, 18, -125, 60, 125, 24, rg(ctx, 48, -60, 60, P.furD, L));
  ellipse(ctx, -50, -6, 44, 16, shade(P.furD, L * 0.6));
  ellipse(ctx, 50, -6, 44, 16, shade(P.furD, L * 0.6));
  // arms
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * 98, -260);
    ctx.rotate(sx * -0.12);
    roundRect(ctx, -26, 0, 52, 150, 24, rg(ctx, 0, 60, 70, P.fur, L));
    ellipse(ctx, 0, 150, 30, 24, shade(P.furD, L * 0.9));
    ctx.restore();
  }
  ellipse(ctx, 0, -205, 104, 116, rg(ctx, 0, -205, 104, P.fur, L));
  ellipse(ctx, 0, -185, 64, 76, rg(ctx, 0, -185, 64, P.belly, L));
  // vest
  poly(ctx, [[-100, -255], [-48, -300], [-40, -120], [-94, -150]], shade(P.vest, L));
  poly(ctx, [[100, -255], [48, -300], [40, -120], [94, -150]], shade(P.vest, L));
  for (const by of [-250, -205, -160]) ellipse(ctx, -46, by, 6, 6, shade(P.brass, L));
  // torn belly patch
  poly(ctx, [[10, -200], [40, -190], [34, -150], [6, -160]], '#0d0806');
  wires(ctx, 14, -190, L, 3, 30, 2);
  stitches(ctx, [[-30, -260], [-10, -230], [-20, -200]], '#2a1a10', L);
}

// ── HOPSCOTCH (rabbit) ──────────────────────────────────────────────────────
const RABBIT = { fur: '#b5ab96', furD: '#857c6a', inner: '#9a6e6a', cheek: '#8a4a4a', scarf1: '#5a2626', scarf2: '#a89a7a', endo: '#55585c', tooth: '#d0c8b0' };

function rabbitHead(ctx, o) {
  const L = o.light ?? 1, P = RABBIT;
  const tw = Math.sin((o.t ?? 0) * 3.1) * 0.03;
  // ears: left straight, right bent and torn
  ctx.save();
  ctx.translate(-26, -52);
  ctx.rotate(-0.12 + tw);
  roundRect(ctx, -17, -150, 34, 152, 17, rg(ctx, 0, -70, 60, P.fur, L));
  roundRect(ctx, -8, -136, 16, 120, 8, shade(P.inner, L * 0.8));
  ctx.restore();
  ctx.save();
  ctx.translate(28, -52);
  ctx.rotate(0.2);
  roundRect(ctx, -16, -80, 32, 82, 16, rg(ctx, 0, -40, 40, P.fur, L));
  ctx.translate(0, -72);
  ctx.rotate(1.9);
  roundRect(ctx, -15, -70, 30, 72, 15, rg(ctx, 0, -35, 40, P.furD, L));
  poly(ctx, [[-15, -70], [-4, -58], [6, -72], [15, -60], [15, -70]], '#000');
  ctx.restore();
  // head
  ellipse(ctx, 0, 0, 60, 68, rg(ctx, 0, 0, 62, P.fur, L));
  // missing face plate (right side) showing endoskeleton
  poly(ctx, [[8, -46], [52, -36], [60, 6], [40, 30], [14, 18], [4, -14]], '#080808');
  ellipse(ctx, 32, -10, 17, 15, shade(P.endo, L));
  ellipse(ctx, 32, -10, 11, 10, '#050505');
  wires(ctx, 22, 12, L, 3, 26, 1);
  // cheeks
  ellipse(ctx, -34, 22, 13, 9, `rgba(${Math.round(140 * L)},60,60,0.6)`);
  // eyes: left in fur socket, right is the bare endo eye
  eye(ctx, -26, -12, 14, o, '#ff4a3a');
  if (o.eyes !== 'off') {
    ctx.save();
    if (o.eyes === 'glow') {
      ctx.shadowColor = '#ff3a2a';
      ctx.shadowBlur = 26;
    }
    ellipse(ctx, 32, -10, o.eyes === 'white' ? 9 : 4, o.eyes === 'white' ? 9 : 4, o.eyes === 'dim' ? '#6a2a24' : '#ff5a4a');
    ctx.restore();
  }
  // snout + mouth
  const jo = (o.jaw ?? 0) * 40;
  ellipse(ctx, 0, 36 + jo * 0.5, 30, 8 + jo * 0.55, '#070404');
  teeth(ctx, -24, 24, 34, 7, 8, shade(P.tooth, L * 0.9));
  ctx.save();
  ctx.translate(0, jo);
  ellipse(ctx, 0, 50, 30, 14, rg(ctx, 0, 50, 30, P.furD, L));
  teeth(ctx, -22, 22, 42, 7, 7, shade(P.tooth, L * 0.8), false);
  ctx.restore();
  ellipse(ctx, 0, 20, 26, 16, rg(ctx, 0, 20, 26, P.fur, L * 1.05));
  // buck teeth
  roundRect(ctx, -10, 30, 9, 16, 2, shade(P.tooth, L));
  roundRect(ctx, 1, 30, 9, 16, 2, shade(P.tooth, L));
  ellipse(ctx, 0, 12, 9, 6, shade('#3a1a1a', L + 0.2));
}

function rabbitBody(ctx, o) {
  const L = o.light ?? 1, P = RABBIT;
  // thin long legs
  roundRect(ctx, -58, -150, 40, 150, 18, rg(ctx, -38, -75, 50, P.furD, L));
  roundRect(ctx, 18, -150, 40, 150, 18, rg(ctx, 38, -75, 50, P.furD, L));
  // left shin exposed
  poly(ctx, [[-56, -90], [-20, -84], [-22, -50], [-56, -56]], '#0a0a0a');
  ctx.strokeStyle = shade(P.endo, L);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-38, -92);
  ctx.lineTo(-38, -52);
  ctx.stroke();
  ellipse(ctx, -38, -6, 34, 13, shade(P.furD, L * 0.6));
  ellipse(ctx, 38, -6, 34, 13, shade(P.furD, L * 0.6));
  // arms (long, dangling)
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * 70, -300);
    ctx.rotate(sx * -0.08);
    roundRect(ctx, -18, 0, 36, 180, 18, rg(ctx, 0, 80, 60, P.fur, L * 0.95));
    // long fingers
    for (let f = -1; f <= 1; f++) roundRect(ctx, f * 10 - 4, 172, 8, 26, 4, shade(P.furD, L));
    ctx.restore();
  }
  ellipse(ctx, 0, -225, 76, 112, rg(ctx, 0, -225, 80, P.fur, L));
  ellipse(ctx, 0, -205, 46, 70, rg(ctx, 0, -205, 46, '#cfc6b0', L));
  // striped neckerchief
  for (let i = 0; i < 5; i++) {
    poly(ctx, [[-50 + i * 20, -330], [-30 + i * 20, -330], [-30 + i * 14 + 6, -300], [-50 + i * 14 + 6, -300]], shade(i & 1 ? P.scarf2 : P.scarf1, L));
  }
  poly(ctx, [[-14, -300], [14, -300], [0, -268]], shade(P.scarf1, L));
  stitches(ctx, [[30, -280], [44, -240], [36, -200]], '#3a3428', L);
}

// ── PIPPA (parrot) ─────────────────────────────────────────────────────────
const BIRD = { body: '#3f6b5e', bodyD: '#29473f', crest: '#8a3a2a', crest2: '#a8823a', beak: '#a88a5a', beakD: '#6a5434', apron: '#8a8478', dot: '#6a3a3a', leg: '#5c5c58' };

function birdHead(ctx, o) {
  const L = o.light ?? 1, P = BIRD;
  // crest feathers
  for (let i = -1; i <= 1; i++) {
    ctx.save();
    ctx.translate(i * 16, -58);
    ctx.rotate(i * 0.35 + Math.sin((o.t ?? 0) * 2 + i) * 0.04);
    poly(ctx, [[-10, 0], [10, 0], [4, -58 + Math.abs(i) * 12], [-2, -62 + Math.abs(i) * 12]], shade(i === 0 ? P.crest : P.crest2, L));
    ctx.restore();
  }
  ellipse(ctx, 0, 0, 72, 70, rg(ctx, 0, 0, 72, P.body, L));
  // cheek patches
  ellipse(ctx, -44, 10, 20, 26, shade('#7a7468', L));
  ellipse(ctx, 44, 10, 20, 26, shade('#7a7468', L));
  // big unblinking eyes (white by default - very unsettling)
  const ey = { ...o, eyes: o.eyes === 'dim' ? 'white' : o.eyes };
  eye(ctx, -30, -18, 19, ey, o.eyes === 'glow' ? '#f0ffd0' : '#d8d8c8', '#101010');
  eye(ctx, 30, -18, 19, ey, o.eyes === 'glow' ? '#f0ffd0' : '#d8d8c8', '#101010');
  // hooked beak, front-on
  const jo = (o.jaw ?? 0) * 44;
  ctx.save();
  ctx.translate(0, jo);
  poly(ctx, [[-24, 26], [24, 26], [0, 62]], shade(P.beakD, L)); // lower beak
  teeth(ctx, -18, 18, 28, 6, 6, shade('#c8c0a8', L * 0.9), false);
  ctx.restore();
  ellipse(ctx, 0, 30 + jo * 0.4, 22, 4 + jo * 0.4, '#050404');
  poly(ctx, [[-30, -2], [30, -2], [26, 18], [6, 50], [0, 56], [-6, 50], [-26, 18]], rg(ctx, 0, 14, 34, P.beak, L));
  teeth(ctx, -22, 22, 22, 7, 7, shade('#c8c0a8', L));
  ellipse(ctx, -9, 6, 4, 3, '#1a1206');
  ellipse(ctx, 9, 6, 4, 3, '#1a1206');
  // cracked plating
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, -50);
  ctx.lineTo(52, -30);
  ctx.lineTo(46, -14);
  ctx.lineTo(58, 4);
  ctx.stroke();
}

function birdBody(ctx, o) {
  const L = o.light ?? 1, P = BIRD;
  // metal bird legs with talons
  ctx.strokeStyle = shade(P.leg, L);
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-34, -110);
  ctx.lineTo(-40, -8);
  ctx.moveTo(34, -110);
  ctx.lineTo(40, -8);
  ctx.stroke();
  ctx.lineWidth = 6;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    for (const a of [-0.6, 0, 0.6]) {
      ctx.moveTo(sx * 40, -8);
      ctx.lineTo(sx * 40 + Math.sin(a) * 30, -8 + Math.cos(a) * 8);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // wings as arms with feather fringe
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * 92, -270);
    ctx.rotate(sx * -0.15);
    const pts = [[-22, 0], [22, 0], [26, 150]];
    for (let i = 0; i < 5; i++) pts.push([18 - i * 11, 170 - (i & 1) * 18]);
    pts.push([-26, 140]);
    poly(ctx, pts, rg(ctx, 0, 80, 70, P.bodyD, L));
    ctx.restore();
  }
  ellipse(ctx, 0, -195, 98, 118, rg(ctx, 0, -195, 98, P.body, L));
  // tattered polka-dot apron
  poly(ctx, [[-60, -250], [60, -250], [72, -110], [40, -96], [20, -110], [-4, -92], [-30, -112], [-70, -104]], shade(P.apron, L));
  for (let i = 0; i < 9; i++) ellipse(ctx, -40 + (i % 3) * 40 + (i > 2 && i < 6 ? 20 : 0), -225 + Math.floor(i / 3) * 40, 7, 7, shade(P.dot, L));
  poly(ctx, [[-60, -250], [60, -250], [52, -266], [-52, -266]], shade('#5a5448', L));
  stitches(ctx, [[-80, -160], [-60, -140], [-66, -110]], '#14201c', L);
}

// ── SCRAPS (hound) ─────────────────────────────────────────────────────────
const HOUND = { fur: '#6d6a63', furD: '#46433e', snout: '#857f72', endo: '#5b5f63', tag: '#a08a3a', collar: '#4a1c1c', tongue: '#6a2c2c' };

function houndHead(ctx, o) {
  const L = o.light ?? 1, P = HOUND;
  // ears: one pointed (torn), one flopped
  poly(ctx, [[-50, -30], [-74, -110], [-60, -100], [-50, -116], [-20, -48]], rg(ctx, -48, -70, 50, P.furD, L));
  ctx.save();
  ctx.translate(46, -40);
  ctx.rotate(0.9);
  roundRect(ctx, -16, -10, 32, 86, 14, rg(ctx, 0, 30, 40, P.furD, L));
  ctx.restore();
  ellipse(ctx, 0, -10, 62, 56, rg(ctx, 0, -10, 62, P.fur, L));
  // long snout coming toward camera (front view = tall, narrow)
  roundRect(ctx, -34, -10, 68, 88, 26, rg(ctx, 0, 30, 50, P.snout, L));
  // exposed endo on forehead
  poly(ctx, [[-30, -54], [-2, -60], [10, -38], [-18, -30]], '#0a0a0a');
  ellipse(ctx, -12, -46, 8, 6, shade(P.endo, L));
  eye(ctx, -26, -18, 13, o, '#ffd27a');
  eye(ctx, 26, -18, 13, o, '#ffd27a');
  // jaw - lots of teeth
  const jo = (o.jaw ?? 0) * 52;
  ellipse(ctx, 0, 66 + jo * 0.5, 30, 8 + jo * 0.55, '#060303');
  if (jo > 10) ellipse(ctx, 0, 72 + jo * 0.6, 14, 6 + jo * 0.2, shade(P.tongue, L));
  teeth(ctx, -28, 28, 62, 10, 9, shade('#d0c8b0', L));
  ctx.save();
  ctx.translate(0, jo);
  roundRect(ctx, -28, 70, 56, 22, 10, rg(ctx, 0, 80, 30, P.furD, L));
  teeth(ctx, -26, 26, 72, 9, 8, shade('#c0b8a0', L), false);
  ctx.restore();
  // nose at the tip of the snout, nostrils
  ellipse(ctx, 0, 46, 19, 12, shade('#141210', L + 0.2));
  ellipse(ctx, -6, 44, 4, 3, '#000');
  ellipse(ctx, 6, 44, 4, 3, '#000');
  stitches(ctx, [[30, 0], [38, 30], [30, 60]], '#22201c', L);
}

function houndBody(ctx, o) {
  const L = o.light ?? 1, P = HOUND;
  const run = o.pose === 'run';
  const t = o.t ?? 0;
  // skeletal metal legs
  ctx.strokeStyle = shade(P.endo, L);
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  const k = run ? Math.sin(t * 18) : 0;
  ctx.beginPath();
  ctx.moveTo(-36, -150);
  ctx.lineTo(-48 - k * 30, -76);
  ctx.lineTo(-40 - k * 45, -6);
  ctx.moveTo(36, -150);
  ctx.lineTo(48 + k * 30, -76);
  ctx.lineTo(40 + k * 45, -6);
  ctx.stroke();
  for (const [x, y] of [[-48 - k * 30, -76], [48 + k * 30, -76]]) ellipse(ctx, x, y, 9, 9, shade('#2a2c2e', L));
  // fur scraps still on one thigh
  roundRect(ctx, 22, -160, 40, 60, 16, rg(ctx, 42, -130, 40, P.furD, L));
  ctx.lineCap = 'butt';
  // hunched torso
  ctx.save();
  ctx.translate(0, -230);
  ctx.rotate(run ? 0.12 : 0.04);
  ellipse(ctx, 0, 0, 80, 96, rg(ctx, 0, 0, 80, P.fur, L));
  poly(ctx, [[-20, -20], [30, -30], [36, 30], [-10, 40]], '#090909');
  // ribcage bars
  ctx.strokeStyle = shade(P.endo, L);
  ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-14, -14 + i * 14);
    ctx.lineTo(30, -22 + i * 14);
    ctx.stroke();
  }
  wires(ctx, 0, 30, L, 3, 40, 3);
  ctx.restore();
  // long arms with claws
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * 70, -300);
    ctx.rotate(sx * (run ? -0.6 + k * 0.3 * sx : -0.1));
    roundRect(ctx, -15, 0, 30, 170, 14, rg(ctx, 0, 70, 50, P.furD, L));
    for (let f = -1; f <= 1; f++) poly(ctx, [[f * 9 - 4, 166], [f * 9 + 4, 166], [f * 11, 196]], shade('#b0a890', L));
    ctx.restore();
  }
  // collar + tag (the jingle)
  ctx.save();
  ctx.translate(0, -312);
  roundRect(ctx, -46, -10, 92, 18, 6, shade(P.collar, L));
  ellipse(ctx, 0, 18, 11, 11, shade(P.tag, L * 1.1));
  ctx.restore();
}

// ── Public API ─────────────────────────────────────────────────────────────

const PARTS = {
  bear: { head: bearHead, body: bearBody, headY: -330 },
  rabbit: { head: rabbitHead, body: rabbitBody, headY: -380 },
  bird: { head: birdHead, body: birdBody, headY: -345 },
  runner: { head: houndHead, body: houndBody, headY: -360 },
};

/**
 * Draw a full character with feet at (x, y). s = scale (1 => ~420px tall).
 */
export function drawCharacter(ctx, id, x, y, s, o = {}) {
  const part = PARTS[id];
  if (!part) return;
  const t = o.t ?? 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * (o.flip ? -1 : 1), s);
  let lean = 0;
  if (o.pose === 'lean') lean = 0.12;
  if (o.pose === 'run') lean = 0.18;
  if (o.pose === 'slump') lean = -0.06;
  ctx.rotate(lean);
  part.body(ctx, o);
  ctx.save();
  ctx.translate(0, part.headY);
  // subtle servo twitch
  const twitch = (o.twitch ?? 0) * Math.sin(t * 37) * Math.sin(t * 3.3);
  ctx.rotate((o.tilt ?? 0) + twitch * 0.08 + (o.pose === 'slump' ? 0.25 : 0));
  part.head(ctx, o);
  ctx.restore();
  ctx.restore();
}

/** Draw only the head centred at (x, y); used for jumpscares and lens peeks. */
export function drawHead(ctx, id, x, y, s, o = {}) {
  const part = PARTS[id];
  if (!part) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(o.tilt ?? 0);
  part.head(ctx, o);
  ctx.restore();
}

/** Pre-render a silhouette (pure black with optional eye glints) for menus. */
export function drawSilhouette(ctx, id, x, y, s, { eyes = false, alpha = 1, t = 0 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawCharacter(ctx, id, x, y, s, { light: 0.06, eyes: eyes ? 'glow' : 'off', t });
  ctx.restore();
}

export const CHARACTER_IDS = Object.keys(PARTS);
export { TAU };
