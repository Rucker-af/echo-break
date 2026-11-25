// 効果音：音声ファイルを使わず WebAudio でその場で合成する
export class AudioFX {
  constructor() { this.ctx = null; this.volume = 0.7; this.last = {}; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.out = comp; // 録画用に音を分けて取り出せるようにする
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  env(g, t0, attack, dur, peak) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  noise(dur, { type = 'lowpass', f = 2000, f2 = null, q = 0.7, gain = 0.5, attack = 0.003, delay = 0 } = {}) {
    const c = this.ctx, t0 = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const filt = c.createBiquadFilter(); filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(f, t0);
    if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = c.createGain(); this.env(g, t0, attack, dur, gain);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }

  tone(dur, { type = 'sine', f = 440, f2 = null, gain = 0.3, attack = 0.004, delay = 0 } = {}) {
    const c = this.ctx, t0 = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = c.createGain(); this.env(g, t0, attack, dur, gain);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  play(name, vol = 1) {
    if (!this.ctx || vol <= 0.02) return;
    const now = this.ctx.currentTime;
    const gap = { arc: 0.05, hit: 0.03, enemyShot: 0.05, land: 0.1, explosion: 0.04 }[name] || 0.012;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    const v = vol;
    switch (name) {
      case 'rifle': this.noise(0.12, { type: 'bandpass', f: 2600, f2: 600, q: 0.8, gain: 0.5 * v }); this.tone(0.09, { type: 'square', f: 340, f2: 90, gain: 0.16 * v }); break;
      case 'smg': this.noise(0.08, { type: 'bandpass', f: 3200, f2: 900, q: 0.9, gain: 0.4 * v }); this.tone(0.06, { type: 'square', f: 420, f2: 140, gain: 0.1 * v }); break;
      case 'dmr': this.noise(0.22, { type: 'bandpass', f: 2200, f2: 300, q: 0.7, gain: 0.7 * v }); this.tone(0.18, { type: 'sawtooth', f: 260, f2: 60, gain: 0.25 * v }); break;
      case 'grav': this.tone(1.1, { type: 'sawtooth', f: 520, f2: 45, gain: 0.22 * v }); this.tone(1.1, { f: 80, f2: 30, gain: 0.5 * v }); break;
      case 'unlock': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(0.35, { type: 'triangle', f, gain: 0.14 * v, delay: i * 0.07 })); break;
      case 'shotgun': this.noise(0.38, { f: 3200, f2: 180, gain: 0.95 * v }); this.tone(0.22, { type: 'sawtooth', f: 140, f2: 40, gain: 0.35 * v });
        this.noise(0.07, { type: 'highpass', f: 600, gain: 0.25 * v, delay: 0.42 }); this.noise(0.07, { type: 'highpass', f: 800, gain: 0.25 * v, delay: 0.58 }); break;
      case 'rail': this.tone(0.55, { type: 'sawtooth', f: 1900, f2: 110, gain: 0.28 * v }); this.noise(0.45, { type: 'bandpass', f: 5200, f2: 400, q: 2, gain: 0.5 * v }); this.tone(0.6, { f: 90, f2: 40, gain: 0.5 * v }); break;
      case 'launcher': this.noise(0.32, { f: 900, f2: 180, gain: 0.6 * v }); this.tone(0.3, { type: 'triangle', f: 230, f2: 60, gain: 0.3 * v }); break;
      case 'arc': this.noise(0.07, { type: 'bandpass', f: 3500 + Math.random() * 2000, q: 4, gain: 0.32 * v }); this.tone(0.06, { type: 'square', f: 900 + Math.random() * 600, f2: 200, gain: 0.05 * v }); break;
      case 'explosion': this.noise(0.9, { f: 1300, f2: 55, gain: 1.0 * v }); this.tone(0.7, { f: 110, f2: 30, gain: 0.7 * v }); break;
      case 'hit': this.tone(0.05, { type: 'square', f: 1500, gain: 0.07 * v }); break;
      case 'head': this.tone(0.09, { type: 'triangle', f: 2300, f2: 1800, gain: 0.22 * v }); this.tone(0.06, { f: 3300, gain: 0.1 * v, delay: 0.03 }); break;
      case 'kill': this.tone(0.14, { type: 'triangle', f: 880, f2: 1760, gain: 0.22 * v }); this.tone(0.2, { f: 1320, gain: 0.15 * v, delay: 0.06 }); break;
      case 'jump': this.noise(0.12, { type: 'highpass', f: 1500, gain: 0.12 * v }); break;
      case 'doubleJump': this.tone(0.18, { f: 300, f2: 900, gain: 0.15 * v }); this.noise(0.15, { type: 'highpass', f: 2500, gain: 0.12 * v }); break;
      case 'dash': this.noise(0.28, { type: 'bandpass', f: 600, f2: 3200, q: 1.2, gain: 0.45 * v }); this.tone(0.2, { f: 200, f2: 600, gain: 0.12 * v }); break;
      case 'slide': this.noise(0.6, { type: 'bandpass', f: 800, f2: 300, q: 0.8, gain: 0.25 * v }); break;
      case 'land': this.noise(0.12, { f: 400, gain: 0.3 * v }); break;
      case 'pad': this.tone(0.5, { f: 200, f2: 1200, gain: 0.3 * v }); this.noise(0.4, { type: 'highpass', f: 1000, f2: 4000, gain: 0.15 * v }); break;
      case 'grapple': this.tone(0.25, { type: 'sawtooth', f: 1200, f2: 300, gain: 0.12 * v }); this.noise(0.2, { type: 'highpass', f: 3000, gain: 0.15 * v }); break;
      case 'shock': this.tone(0.8, { f: 60, f2: 30, gain: 0.9 * v }); this.noise(0.6, { f: 2500, f2: 100, gain: 0.6 * v }); this.tone(0.4, { type: 'sawtooth', f: 600, f2: 80, gain: 0.15 * v }); break;
      case 'echo': this.tone(1.0, { f: 220, f2: 880, gain: 0.25 * v }); this.tone(1.0, { f: 330, f2: 1320, gain: 0.18 * v, delay: 0.05 }); this.noise(0.8, { type: 'bandpass', f: 400, f2: 6000, q: 3, gain: 0.2 * v }); break;
      case 'echoEnd': this.tone(0.6, { f: 1320, f2: 220, gain: 0.2 * v }); break;
      case 'hurt': this.tone(0.15, { type: 'sawtooth', f: 200, f2: 80, gain: 0.25 * v }); this.noise(0.1, { f: 800, gain: 0.3 * v }); break;
      case 'reload': this.noise(0.05, { type: 'highpass', f: 2000, gain: 0.2 * v }); this.noise(0.06, { type: 'highpass', f: 1500, gain: 0.25 * v, delay: 0.25 }); this.tone(0.05, { type: 'square', f: 600, gain: 0.05 * v, delay: 0.27 }); break;
      case 'empty': this.tone(0.04, { type: 'square', f: 1800, gain: 0.06 * v }); break;
      case 'switch': this.noise(0.06, { type: 'highpass', f: 2500, gain: 0.15 * v }); break;
      case 'enemyShot': this.tone(0.12, { type: 'square', f: 700, f2: 300, gain: 0.07 * v }); this.noise(0.08, { type: 'bandpass', f: 1500, gain: 0.1 * v }); break;
      case 'bruteShot': this.tone(0.3, { type: 'sawtooth', f: 180, f2: 60, gain: 0.25 * v }); this.noise(0.25, { f: 700, gain: 0.3 * v }); break;
      case 'spawn': this.tone(0.6, { f: 1500, f2: 200, gain: 0.1 * v }); break;
      case 'pickup': this.tone(0.15, { f: 600, f2: 1200, gain: 0.2 * v }); this.tone(0.15, { f: 900, f2: 1800, gain: 0.12 * v, delay: 0.06 }); break;
      case 'wave': this.tone(0.6, { type: 'sawtooth', f: 110, gain: 0.14 * v }); this.tone(0.6, { type: 'sawtooth', f: 165, gain: 0.11 * v, delay: 0.15 }); this.tone(0.8, { type: 'sawtooth', f: 220, gain: 0.11 * v, delay: 0.3 }); break;
      case 'clear': [523, 659, 784, 1046].forEach((f, i) => this.tone(0.4, { type: 'triangle', f, gain: 0.15 * v, delay: i * 0.08 })); break;
      case 'ui': this.tone(0.06, { f: 1200, gain: 0.08 * v }); break;
      case 'die': this.tone(1.2, { type: 'sawtooth', f: 300, f2: 40, gain: 0.3 * v }); break;
      case 'ok': this.tone(0.12, { f: 880, gain: 0.15 * v }); this.tone(0.2, { f: 1320, gain: 0.15 * v, delay: 0.08 }); break;
    }
  }
}
