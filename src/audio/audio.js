// ---------------------------------------------------------------------------
// Fully synthesized audio (Web Audio API) - no sound files needed.
//
// Bus layout:  sources -> [sfx | ambience] -> master -> compressor -> out
//                      \-> reverb send (shared convolver)
// Positional cues use StereoPanner + distance-based gain.
// The AudioContext is created lazily on the first user gesture (autoplay rules).
// ---------------------------------------------------------------------------

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.loops = new Map(); // name -> {stop()}
    this.settings = { masterVolume: 0.8, sfxVolume: 0.9, ambienceVolume: 0.7, muted: false };
    this.menuTimer = null;
    this.officeTimer = null;
  }

  get ready() {
    return !!this.ctx;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(this.comp);
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.2);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut);
    this.reverbOut.connect(this.sfx);
    // noise buffers
    this.white = this.noiseBuffer('white');
    this.brown = this.noiseBuffer('brown');
    this.applySettings(this.settings);
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.settings.muted ? 0 : this.settings.masterVolume;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.settings.sfxVolume, t, 0.05);
    this.amb.gain.setTargetAtTime(this.settings.ambienceVolume, t, 0.05);
  }

  // ── Building blocks ──────────────────────────────────────────────────────

  noiseBuffer(kind, seconds = 3) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  distortion(k = 50) {
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i * 2) / 1024 - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    const ws = this.ctx.createWaveShaper();
    ws.curve = curve;
    ws.oversample = '2x';
    return ws;
  }

  /** Output chain: gain -> panner -> bus (+ optional reverb send) */
  out({ pan = 0, gain = 1, bus = 'sfx', wet = 0 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(bus === 'amb' ? this.amb : this.sfx);
    } else g.connect(bus === 'amb' ? this.amb : this.sfx);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      g.connect(w);
      w.connect(this.reverb);
    }
    return g;
  }

  env(param, t, { a = 0.005, peak = 1, d = 0.2, sustain = 0, hold = 0 }) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (hold) param.setValueAtTime(peak, t + a + hold);
    param.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + hold + d);
  }

  tone({ type = 'sine', freq = 440, freqEnd = null, dur = 0.3, gain = 0.3, pan = 0, a = 0.005, delay = 0, wet = 0, bus = 'sfx', detune = 0, filter = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = ctx.createGain();
    this.env(g.gain, t, { a, peak: gain, d: dur });
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq;
      f.Q.value = filter.Q ?? 1;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.out({ pan, wet, bus }));
    o.start(t);
    o.stop(t + a + dur + 0.05);
  }

  noise({ dur = 0.3, gain = 0.3, pan = 0, type = 'bandpass', freq = 1000, freqEnd = null, Q = 1, a = 0.005, delay = 0, wet = 0, brown = false, bus = 'sfx', hold = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.white;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur + hold);
    f.Q.value = Q;
    const g = ctx.createGain();
    this.env(g.gain, t, { a, peak: gain, d: dur, hold });
    src.connect(f);
    f.connect(g);
    g.connect(this.out({ pan, wet, bus }));
    src.start(t, Math.random() * 2);
    src.stop(t + a + hold + dur + 0.05);
  }

  /** Metallic hit: inharmonic partials */
  metal({ base = 300, dur = 0.6, gain = 0.15, pan = 0, delay = 0, wet = 0.3 }) {
    for (const [m, g] of [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2]]) {
      this.tone({ type: 'triangle', freq: base * m * (0.98 + Math.random() * 0.04), dur: dur / Math.sqrt(m), gain: gain * g, pan, delay, wet });
    }
    this.noise({ dur: 0.05, gain: gain * 0.8, freq: base * 4, Q: 0.8, pan, delay });
  }

  /** Persistent looped node graph; returns handle with stop() and nodes. */
  startLoop(name, build) {
    if (!this.ctx || this.loops.has(name)) return this.loops.get(name);
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.6);
    const nodes = build(ctx, master) || {};
    const handle = {
      master,
      nodes,
      stop: (fade = 0.4) => {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + fade);
        setTimeout(() => (nodes.sources || []).forEach((s) => { try { s.stop(); } catch { /* already stopped */ } }), fade * 1000 + 100);
        this.loops.delete(name);
      },
    };
    this.loops.set(name, handle);
    return handle;
  }

  stopLoop(name, fade) {
    this.loops.get(name)?.stop(fade);
  }

  stopAll(fade = 0.3) {
    [...this.loops.keys()].forEach((k) => this.stopLoop(k, fade));
    this.setAmbientEvents(null);
  }

  loopNoise(ctx, out, { brown = false, type = 'lowpass', freq = 200, Q = 0.7, gain = 0.2 }) {
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.white;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(0, Math.random() * 2);
    return { src, f, g };
  }

  // ── Ambience beds ────────────────────────────────────────────────────────

  menuAmbience() {
    if (!this.ctx) return;
    this.stopLoop('office');
    this.stopLoop('fan');
    this.startLoop('menu', (ctx, m) => {
      m.connect(this.amb);
      const sources = [];
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      lp.connect(m);
      for (const [f, det] of [[55, 0], [55.4, 7], [82.4, -5]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.06;
        o.connect(g);
        g.connect(lp);
        o.start();
        sources.push(o);
      }
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lg = ctx.createGain();
      lg.gain.value = 120;
      lfo.connect(lg);
      lg.connect(lp.frequency);
      lfo.start();
      sources.push(lfo);
      const wind = this.loopNoise(ctx, m, { brown: true, type: 'bandpass', freq: 400, Q: 0.6, gain: 0.25 });
      sources.push(wind.src);
      return { sources };
    });
    this.setAmbientEvents('menu');
  }

  officeAmbience() {
    if (!this.ctx) return;
    this.stopLoop('menu');
    this.startLoop('office', (ctx, m) => {
      m.connect(this.amb);
      const sources = [];
      // room tone
      sources.push(this.loopNoise(ctx, m, { brown: true, type: 'lowpass', freq: 160, gain: 0.5 }).src);
      // electrical hum with slow tremolo
      const hum = ctx.createGain();
      hum.gain.value = 0.05;
      hum.connect(m);
      for (const [f, g, type] of [[60, 0.6, 'sine'], [120, 0.35, 'sine'], [180, 0.12, 'sawtooth']]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = g;
        o.connect(og);
        og.connect(hum);
        o.start();
        sources.push(o);
      }
      const trem = ctx.createOscillator();
      trem.frequency.value = 0.23;
      const tg = ctx.createGain();
      tg.gain.value = 0.02;
      trem.connect(tg);
      tg.connect(hum.gain);
      trem.start();
      sources.push(trem);
      return { sources, hum };
    });
    this.startLoop('fan', (ctx, m) => {
      m.connect(this.amb);
      const fanBus = ctx.createGain();
      fanBus.gain.value = 0.22;
      fanBus.connect(m);
      const n = this.loopNoise(ctx, fanBus, { type: 'bandpass', freq: 900, Q: 0.5, gain: 0.5 });
      // blade whoosh modulation
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 11;
      const lg = ctx.createGain();
      lg.gain.value = 0.22;
      lfo.connect(lg);
      lg.connect(n.g.gain);
      lfo.start();
      const motor = ctx.createOscillator();
      motor.type = 'triangle';
      motor.frequency.value = 47;
      const mg = ctx.createGain();
      mg.gain.value = 0.07;
      motor.connect(mg);
      mg.connect(fanBus);
      motor.start();
      return { sources: [n.src, lfo, motor], fanBus, lfo };
    });
    this.setAmbientEvents('office');
  }

  /** Lower the fan when the monitor is raised (it's "behind" the screen) */
  setFanLevel(v) {
    const fan = this.loops.get('fan');
    if (fan && this.ctx) fan.nodes.fanBus.gain.setTargetAtTime(0.22 * v, this.ctx.currentTime, 0.1);
  }

  /** Random environmental sounds that make the building feel alive */
  setAmbientEvents(mode) {
    clearTimeout(this.ambTimer);
    this.ambMode = mode;
    if (!mode) return;
    const schedule = () => {
      const delay = (mode === 'menu' ? 5 : 12) + Math.random() * (mode === 'menu' ? 9 : 22);
      this.ambTimer = setTimeout(() => {
        if (this.ambMode !== mode) return;
        this.ambientEvent(mode);
        schedule();
      }, delay * 1000);
    };
    schedule();
  }

  ambientEvent(mode) {
    const pan = Math.random() * 2 - 1;
    const r = Math.random();
    if (mode === 'menu') {
      if (r < 0.4) this.metal({ base: 120 + Math.random() * 80, gain: 0.05, pan, wet: 0.9, dur: 1.4 });
      else if (r < 0.7) this.musicBoxPhrase(pan, 0.05);
      else this.noise({ dur: 2.5, gain: 0.08, freq: 300, freqEnd: 120, Q: 2, pan, a: 1, brown: true, wet: 0.5, bus: 'amb' });
    } else {
      if (r < 0.3) this.metal({ base: 90 + Math.random() * 60, gain: 0.05, pan, wet: 0.9, dur: 1.6 });
      else if (r < 0.55) this.pipeGroan(pan);
      else if (r < 0.75) this.footsteps({ pan, gain: 0.05, count: 3, interval: 0.6, wet: 0.8 });
      else this.noise({ dur: 0.6, gain: 0.05, freq: 3000, Q: 4, pan, wet: 0.5 }); // electrical crackle
    }
  }

  // ── Sound effects ────────────────────────────────────────────────────────

  click() {
    this.tone({ type: 'square', freq: 1800, dur: 0.025, gain: 0.08 });
    this.tone({ type: 'sine', freq: 300, dur: 0.04, gain: 0.1 });
  }

  uiHover() {
    this.tone({ type: 'sine', freq: 520, freqEnd: 480, dur: 0.05, gain: 0.025 });
  }

  deadButton(pan = 0) {
    this.tone({ type: 'square', freq: 140, dur: 0.06, gain: 0.08, pan, filter: { freq: 900 } });
  }

  doorSlam(pan, closing) {
    this.click();
    // motor whine + slam
    this.tone({ type: 'sawtooth', freq: closing ? 220 : 160, freqEnd: closing ? 120 : 260, dur: 0.22, gain: 0.08, pan, filter: { freq: 800 } });
    if (closing) {
      this.noise({ dur: 0.35, gain: 0.5, type: 'lowpass', freq: 700, freqEnd: 150, pan, delay: 0.18, wet: 0.3 });
      this.tone({ type: 'sine', freq: 70, freqEnd: 38, dur: 0.35, gain: 0.5, pan, delay: 0.18 });
      this.metal({ base: 210, gain: 0.07, pan, delay: 0.18, dur: 0.8 });
    } else {
      this.noise({ dur: 0.25, gain: 0.18, type: 'bandpass', freq: 1200, Q: 0.7, pan, delay: 0.12 });
      this.tone({ type: 'sine', freq: 110, freqEnd: 60, dur: 0.18, gain: 0.2, pan, delay: 0.16 });
    }
  }

  lightOn(side, on) {
    const pan = side === 'left' ? -0.85 : 0.85;
    this.click();
    const name = `light-${side}`;
    if (!on) return this.stopLoop(name, 0.05);
    this.startLoop(name, (ctx, m) => {
      const out = this.out({ pan, gain: 0.07 });
      m.connect(out);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 120;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 240;
      f.Q.value = 3;
      o.connect(f);
      f.connect(m);
      o.start();
      const crackle = this.loopNoise(ctx, m, { type: 'highpass', freq: 5000, gain: 0.25 });
      return { sources: [o, crackle.src] };
    });
  }

  monitor(up) {
    this.tone({ type: 'sawtooth', freq: up ? 300 : 500, freqEnd: up ? 600 : 250, dur: 0.18, gain: 0.04, filter: { freq: 1500 } });
    this.noise({ dur: 0.18, gain: 0.07, freq: 3000, Q: 0.6, type: 'highpass' });
    this.tone({ type: 'square', freq: 2400, dur: 0.02, gain: 0.03, delay: 0.17 });
    if (up) {
      this.startLoop('camstatic', (ctx, m) => {
        m.connect(this.out({ gain: 0.035 }));
        const n = this.loopNoise(ctx, m, { type: 'highpass', freq: 2500, gain: 0.7 });
        const hum = ctx.createOscillator();
        hum.frequency.value = 15734 / 4; // CRT whine (pitched down)
        const hg = ctx.createGain();
        hg.gain.value = 0.02;
        hum.connect(hg);
        hg.connect(m);
        hum.start();
        return { sources: [n.src, hum] };
      });
    } else this.stopLoop('camstatic', 0.1);
  }

  camSwitch() {
    this.tone({ type: 'square', freq: 1400, dur: 0.03, gain: 0.05 });
    this.noise({ dur: 0.18, gain: 0.16, freq: 4000, type: 'highpass' });
  }

  interference() {
    this.noise({ dur: 0.4, gain: 0.12, freq: 2200, Q: 0.4, type: 'bandpass' });
    this.tone({ type: 'sawtooth', freq: 60, dur: 0.3, gain: 0.05, filter: { freq: 400 } });
  }

  /** Metallic animatronic footsteps; gain/pan reflect location. */
  footsteps({ pan = 0, gain = 0.2, count = 4, interval = 0.45, wet = 0.4, heavy = false }) {
    for (let i = 0; i < count; i++) {
      const d = i * interval * (0.9 + Math.random() * 0.2);
      this.tone({ type: 'sine', freq: heavy ? 60 : 85, freqEnd: 35, dur: 0.18, gain: gain * 1.4, pan, delay: d, wet });
      this.noise({ dur: 0.06, gain: gain * 0.6, freq: 1600, Q: 1.2, pan, delay: d, wet });
      if (i % 2 === 0) this.tone({ type: 'triangle', freq: 340 + Math.random() * 60, dur: 0.25, gain: gain * 0.25, pan, delay: d, wet });
    }
  }

  servo(pan = 0, gain = 0.08) {
    this.tone({ type: 'sawtooth', freq: 180, freqEnd: 260, dur: 0.5, gain, pan, filter: { type: 'bandpass', freq: 700, Q: 3 }, wet: 0.4 });
    this.tone({ type: 'sawtooth', freq: 240, freqEnd: 170, dur: 0.4, gain: gain * 0.8, pan, delay: 0.5, filter: { type: 'bandpass', freq: 600, Q: 3 }, wet: 0.4 });
  }

  /** Mortimer's low mechanical chuckle */
  bearLaugh(pan = 0, gain = 0.2) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.22;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(110 - i * 8, t);
      o.frequency.exponentialRampToValueAtTime(70 - i * 6, t + 0.2);
      const ws = this.distortion(30);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 520;
      f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 900;
      f2.Q.value = 6;
      const g = ctx.createGain();
      this.env(g.gain, t, { a: 0.02, peak: gain, d: 0.2 });
      o.connect(ws);
      ws.connect(f1);
      ws.connect(f2);
      f1.connect(g);
      f2.connect(g);
      g.connect(this.out({ pan, wet: 0.7 }));
      o.start(t);
      o.stop(t + 0.3);
    }
  }

  rabbitGroan(pan = 0, gain = 0.12) {
    this.tone({ type: 'sawtooth', freq: 75, freqEnd: 55, dur: 1.1, gain, pan, a: 0.15, filter: { type: 'bandpass', freq: 300, Q: 4 }, wet: 0.5 });
    this.servo(pan, gain * 0.5);
  }

  birdScreech(pan = 0, gain = 0.1) {
    for (let i = 0; i < 4; i++) this.tone({ type: 'square', freq: 1300 - i * 120, freqEnd: 700, dur: 0.08, gain, pan, delay: i * 0.09, filter: { freq: 2500 }, wet: 0.5 });
  }

  breathing(pan, gain = 0.12) {
    for (let i = 0; i < 2; i++) {
      this.noise({ dur: 0.9, gain, freq: 700, freqEnd: 450, Q: 2, pan, a: 0.6, delay: i * 2.0, brown: false });
      this.noise({ dur: 0.7, gain: gain * 0.7, freq: 500, freqEnd: 700, Q: 2, pan, a: 0.4, delay: i * 2.0 + 1.1 });
    }
  }

  clatter(pan = 0.5) {
    for (let i = 0; i < 5; i++) this.metal({ base: 300 + Math.random() * 500, gain: 0.04, pan, delay: i * (0.08 + Math.random() * 0.12), dur: 0.5, wet: 0.6 });
  }

  pipeGroan(pan = 0) {
    this.tone({ type: 'sawtooth', freq: 48, freqEnd: 41, dur: 2.2, gain: 0.05, pan, a: 0.6, filter: { type: 'bandpass', freq: 200, Q: 6 }, wet: 0.7, bus: 'amb' });
  }

  runnerStir(gain = 0.05) {
    this.jingle(-0.7, gain);
    this.servo(-0.7, gain * 0.6);
  }

  jingle(pan, gain = 0.1, count = 6, delay = 0) {
    for (let i = 0; i < count; i++) {
      const d = delay + i * 0.06 + Math.random() * 0.04;
      for (const f of [2600, 3350, 4100]) this.tone({ type: 'triangle', freq: f * (0.97 + Math.random() * 0.06), dur: 0.12, gain: gain * 0.4, pan, delay: d });
    }
  }

  /** Scraps' sprint: fast pounding steps + collar jingle, growing louder and moving left. */
  runnerSprint(duration) {
    const step = 0.17;
    const steps = Math.max(4, Math.floor(duration / step));
    for (let i = 0; i < steps; i++) {
      const k = i / steps, d = i * step, pan = -0.4 - 0.6 * k;
      this.tone({ type: 'sine', freq: 80, freqEnd: 35, dur: 0.14, gain: 0.1 + 0.45 * k, pan, delay: d, wet: 0.3 * (1 - k) });
      this.noise({ dur: 0.05, gain: 0.08 + 0.22 * k, freq: 1800, Q: 1.2, pan, delay: d });
      if (i % 2 === 0) this.jingle(pan, 0.05 + 0.12 * k, 2, d);
    }
  }

  doorBang() {
    for (let i = 0; i < 4; i++) {
      const d = i * 0.2 + Math.random() * 0.05;
      this.tone({ type: 'sine', freq: 65, freqEnd: 32, dur: 0.3, gain: 0.7, pan: -0.9, delay: d });
      this.noise({ dur: 0.25, gain: 0.45, type: 'lowpass', freq: 900, freqEnd: 200, pan: -0.9, delay: d, wet: 0.4 });
      this.metal({ base: 160, gain: 0.08, pan: -0.9, delay: d, dur: 0.6 });
    }
  }

  /** Dissonant swell when the hall light reveals someone. */
  sting(gain = 0.25) {
    for (const f of [155, 164.8, 233, 1240, 1312]) this.tone({ type: f > 1000 ? 'sine' : 'sawtooth', freq: f, dur: 1.4, gain: gain * (f > 1000 ? 0.3 : 0.25), a: 0.03, filter: { freq: 2600 }, wet: 0.5 });
    this.noise({ dur: 0.5, gain: gain * 0.6, freq: 500, Q: 0.5, a: 0.01, wet: 0.4 });
  }

  /** Tension bed when something is close (intensity 0..1, pan -1..1) */
  setDanger(intensity, pan = 0) {
    if (!this.ctx) return;
    if (intensity <= 0.01) return this.stopLoop('danger', 1.2);
    const h = this.startLoop('danger', (ctx, m) => {
      const out = this.out({ gain: 1, bus: 'amb' });
      m.connect(out);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(m);
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 41.2;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = 43.65;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 180;
      o1.connect(f);
      o2.connect(f);
      f.connect(g);
      o1.start();
      o2.start();
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      return { sources: [o1, o2], g, p };
    });
    h?.nodes.g?.gain.setTargetAtTime(0.06 * intensity, this.ctx.currentTime, 0.8);
  }

  powerDown() {
    this.stopLoop('office', 1.8);
    this.stopLoop('fan', 3.0);
    this.stopLoop('camstatic', 0.1);
    this.stopLoop('light-left', 0.05);
    this.stopLoop('light-right', 0.05);
    this.stopLoop('danger', 0.5);
    this.setAmbientEvents(null);
    this.tone({ type: 'sawtooth', freq: 400, freqEnd: 30, dur: 2.2, gain: 0.15, filter: { freq: 1200 } });
    this.noise({ dur: 0.4, gain: 0.5, type: 'lowpass', freq: 600, freqEnd: 80, wet: 0.6 });
    this.metal({ base: 140, gain: 0.1, dur: 2, wet: 0.9 });
  }

  /** Bell-like music box note (inharmonic partials, slow decay) */
  bell(freq, { gain = 0.08, pan = 0, delay = 0, wet = 0.5 } = {}) {
    this.tone({ type: 'sine', freq, dur: 1.1, gain, pan, delay, wet, detune: (Math.random() - 0.5) * 18 });
    this.tone({ type: 'sine', freq: freq * 2.76, dur: 0.5, gain: gain * 0.3, pan, delay, wet });
    this.tone({ type: 'sine', freq: freq * 5.4, dur: 0.2, gain: gain * 0.12, pan, delay, wet });
  }

  // Original melody (minor, slightly off-kilter) used for the power-out sequence.
  static MELODY = [
    [659, 1], [587, 1], [523, 1], [494, 2], [440, 1], [494, 1], [523, 2], [494, 1], [440, 1], [415, 2], [440, 3],
    [523, 1], [494, 1], [440, 1], [392, 2], [349, 1], [392, 1], [440, 2], [415, 1], [392, 1], [330, 4],
  ];

  musicBoxPhrase(pan = 0, gain = 0.06) {
    const notes = AudioEngine.MELODY.slice(0, 6);
    let tt = 0;
    for (const [f, len] of notes) {
      this.bell(f, { gain, pan, delay: tt, wet: 0.9 });
      tt += len * 0.32;
    }
  }

  startMusicBox(pan = -0.8) {
    if (!this.ctx) return;
    this.stopMusicBox();
    let i = 0;
    const play = () => {
      const [f, len] = AudioEngine.MELODY[i % AudioEngine.MELODY.length];
      // tape-warble: slight random detune
      this.bell(f * (0.985 + Math.random() * 0.02), { gain: 0.11, pan, wet: 0.6 });
      i++;
      this.musicTimer = setTimeout(play, len * 330);
    };
    play();
  }

  stopMusicBox() {
    clearTimeout(this.musicTimer);
  }

  /** Character specific scream: layered detuned saws + noise through distortion. */
  jumpscare(id) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.stopAll(0.05);
    this.stopMusicBox();
    const base = { bear: 170, rabbit: 250, bird: 420, runner: 310 }[id] ?? 200;
    const t = ctx.currentTime;
    const ws = this.distortion(80);
    const g = ctx.createGain();
    this.env(g.gain, t, { a: 0.01, peak: 0.55, hold: 0.9, d: 0.5 });
    ws.connect(g);
    g.connect(this.out({ gain: 1 }));
    for (const [mult, det] of [[1, 0], [1.5, 15], [2.02, -20], [0.5, 8]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * mult * 1.4, t);
      o.frequency.exponentialRampToValueAtTime(base * mult, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(base * mult * 0.7, t + 1.4);
      o.detune.value = det;
      const vib = ctx.createOscillator();
      vib.frequency.value = id === 'bird' ? 38 : 26;
      const vg = ctx.createGain();
      vg.gain.value = base * mult * 0.06;
      vib.connect(vg);
      vg.connect(o.frequency);
      o.connect(ws);
      o.start(t);
      vib.start(t);
      o.stop(t + 1.6);
      vib.stop(t + 1.6);
    }
    this.noise({ dur: 1.2, gain: 0.5, freq: 2500, freqEnd: 600, Q: 0.6, a: 0.005, hold: 0.2 });
    this.metal({ base: 240, gain: 0.2, dur: 1.2, wet: 0.5 });
    this.tone({ type: 'sine', freq: 55, freqEnd: 28, dur: 1.2, gain: 0.6 });
  }

  victory() {
    this.stopAll(0.5);
    this.stopMusicBox();
    // clock chime, then a warm chord and a muffled "cheer" noise swell
    [0, 1.2, 2.4].forEach((d, i) => this.bell([523, 659, 784][i] / 2, { gain: 0.2, delay: d, wet: 0.8 }));
    for (const f of [261.6, 329.6, 392, 523.2]) this.tone({ type: 'triangle', freq: f, dur: 4, gain: 0.05, a: 1.2, delay: 3.4, wet: 0.7 });
    this.noise({ dur: 2.5, gain: 0.12, freq: 1400, Q: 0.4, a: 0.8, delay: 3.6, wet: 0.6 });
  }

  defeat() {
    this.startLoop('gameover', (ctx, m) => {
      m.connect(this.out({ gain: 0.06 }));
      const n = this.loopNoise(ctx, m, { type: 'bandpass', freq: 2000, Q: 0.3, gain: 0.9 });
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 36.7;
      const f = ctx.createBiquadFilter();
      f.frequency.value = 140;
      const og = ctx.createGain();
      og.gain.value = 1.5;
      o.connect(f);
      f.connect(og);
      og.connect(m);
      o.start();
      return { sources: [n.src, o] };
    });
  }

  squeak() {
    this.tone({ type: 'sine', freq: 900, freqEnd: 1500, dur: 0.12, gain: 0.1 });
    this.tone({ type: 'sine', freq: 1400, freqEnd: 800, dur: 0.15, gain: 0.08, delay: 0.12 });
  }
}
