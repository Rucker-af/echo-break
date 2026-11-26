// 宣伝動画 v0.3：BGM（コードで作曲・合成）に合わせてカットが切り替わる撮影モード
// 使い方：index.html?trailer2 を開き、コンソールで trailer.start({ record: true, upload: 'http://127.0.0.1:8821/' })
import * as THREE from 'three';
import { damp } from './utils.js';
import { getCharacter } from './characters.js';

const W = 1280, H = 720;
const BPM = 128, BEAT = 60 / BPM, BAR = BEAT * 4;
const END = BAR * 14; // 26.25 秒
const URL_TEXT = 'rucker0.itch.io/echobreak';
const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);

export function setup(game) { const tr = new Trailer(game); window.trailer = tr; return tr; }

// ---------------------------------------------------------------
// BGM：シンセウェーブ（Am - F - C - G）
// ---------------------------------------------------------------
function music(ctx, out, t0) {
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const bus = ctx.createGain(); bus.gain.value = 0.62; bus.connect(out);
  // パッド用のフィルター（だんだん開く）とポンプ（キックに合わせて沈む）
  const padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.Q.value = 0.8;
  const pump = ctx.createGain(); pump.gain.value = 1;
  padF.connect(pump); pump.connect(bus);
  padF.frequency.setValueAtTime(500, t0);
  padF.frequency.linearRampToValueAtTime(900, t0 + BAR * 2);
  padF.frequency.exponentialRampToValueAtTime(2600, t0 + BAR * 4);
  padF.frequency.setValueAtTime(3400, t0 + BAR * 4);
  padF.frequency.setValueAtTime(3400, t0 + BAR * 11);
  padF.frequency.exponentialRampToValueAtTime(700, t0 + BAR * 14);
  const arpF = ctx.createBiquadFilter(); arpF.type = 'lowpass'; arpF.frequency.value = 2200; arpF.Q.value = 3; arpF.connect(bus);
  arpF.frequency.setValueAtTime(1200, t0); arpF.frequency.exponentialRampToValueAtTime(4200, t0 + BAR * 4);
  // 残響っぽさ（ディレイ）
  const dly = ctx.createDelay(1); dly.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  arpF.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(bus);

  const nbuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = nbuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const tone = (type, f, t, dur, g, dest, o = {}) => {
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + (o.glideT || dur));
    if (o.detune) osc.detune.value = o.detune;
    const env = ctx.createGain(); const a = o.a ?? 0.005, r = o.r ?? 0.08;
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(g, t + a);
    env.gain.setValueAtTime(g, t + Math.max(a, dur - r)); env.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(env); env.connect(dest); osc.start(t); osc.stop(t + dur + 0.05);
  };
  const noise = (t, dur, g, dest, o = {}) => {
    const src = ctx.createBufferSource(); src.buffer = nbuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'highpass'; f.frequency.setValueAtTime(o.f || 8000, t); f.Q.value = o.q || 0.7;
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    const env = ctx.createGain(); const a = o.a ?? 0.002;
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(g, t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(env); env.connect(dest); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  };
  const kick = (t, g = 0.9) => {
    tone('sine', 150, t, 0.32, g, bus, { glide: 42, glideT: 0.16, a: 0.002, r: 0.12 });
    noise(t, 0.02, 0.25, bus, { type: 'highpass', f: 3000 });
    pump.gain.setValueAtTime(0.45, t); pump.gain.linearRampToValueAtTime(1, t + BEAT * 0.85);
  };
  const snare = (t, g = 0.45) => { noise(t, 0.2, g, bus, { type: 'bandpass', f: 1900, q: 0.9 }); tone('triangle', 190, t, 0.12, g * 0.5, bus, { glide: 140 }); };
  const hat = (t, g = 0.12) => noise(t, 0.05, g, bus, { type: 'highpass', f: 8500 });
  const impact = (t) => { tone('sine', 90, t, 1.4, 0.9, bus, { glide: 30, glideT: 1.2, r: 1 }); noise(t, 1.8, 0.4, bus, { type: 'lowpass', f: 9000, f2: 300 }); noise(t, 2.2, 0.14, bus, { type: 'highpass', f: 6000 }); };

  const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]]; // Am F C(転回) G
  const roots = [33, 29, 36, 31];
  for (let bar = 0; bar < 14; bar++) {
    const tb = t0 + bar * BAR, ch = chords[bar % 4], root = roots[bar % 4];
    const drop = bar >= 4 && bar < 11, build = bar === 2 || bar === 3, outro = bar >= 11;
    // パッド（デチューンしたノコギリ波）
    for (const n of ch) for (const det of [-9, 9]) tone('sawtooth', mtof(n), tb, BAR + 0.05, outro ? 0.05 : 0.04, padF, { a: 0.25, r: 0.3, detune: det });
    if (outro && bar === 13) continue;
    // アルペジオ（16分音符）
    const pat = [0, 1, 2, 1, 0, 2, 1, 2];
    for (let i = 0; i < 16; i++) {
      if (outro && i > 7) break;
      const n = ch[pat[i % 8]] + 12 + (i >= 8 && drop ? 12 : 0);
      tone(drop ? 'square' : 'triangle', mtof(n), tb + i * BEAT / 4, BEAT / 4 * 0.9, drop ? 0.05 : 0.06, arpF, { r: 0.05 });
    }
    // ベース（8分）
    if (build || drop) for (let i = 0; i < 8; i++) tone('sawtooth', mtof(root + (i % 2 ? 12 : 0)), tb + i * BEAT / 2, BEAT / 2 * 0.85, drop ? 0.2 : 0.14, bus, { r: 0.06 });
    // ドラム
    if (build) {
      for (let b = 0; b < 4; b++) kick(tb + b * BEAT, bar === 2 ? 0.55 : 0.7);
      for (let i = 0; i < 8; i++) hat(tb + i * BEAT / 2 + BEAT / 4, 0.06 + bar * 0.02);
      if (bar === 3) {
        for (let i = 0; i < 8; i++) snare(tb + BAR / 2 + i * BEAT / 4, 0.12 + i * 0.04);
        noise(tb, BAR, 0.22, bus, { type: 'bandpass', f: 400, f2: 9000, q: 1.5, a: BAR * 0.9 });
      }
    }
    if (drop) {
      for (let b = 0; b < 4; b++) kick(tb + b * BEAT);
      snare(tb + BEAT); snare(tb + BEAT * 3);
      for (let i = 0; i < 8; i++) hat(tb + i * BEAT / 2 + BEAT / 4, i % 2 ? 0.1 : 0.14);
      if (bar === 8) for (let i = 0; i < 4; i++) snare(tb + BAR * 0.75 + i * BEAT / 4, 0.25 + i * 0.06);
    }
    if (bar === 4 || bar === 9 || bar === 11) impact(tb);
  }
}

// ---------------------------------------------------------------
class Trailer {
  constructor(g) {
    this.g = g;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: 9999, pointerEvents: 'none', display: 'none', background: '#000' });
    document.body.appendChild(this.canvas);
    this.extra = [];
  }

  ground(x, z, y = 0) { const w = this.g.world.raycast(_v.set(x, 60, z), _down, 120); return w ? w.point.y : y; }
  hold(a, on) { const I = this.g.input; if (on) I.press(a); else I.release(a); }
  releaseAll() { for (const a of ['fwd', 'back', 'left', 'right', 'fire', 'jump', 'dash', 'slide', 'ads']) this.hold(a, false); }

  aimAt(target, k, dt) {
    const p = this.g.player, cam = this.g.camera;
    const d = _v.subVectors(target, cam.position);
    const yaw = Math.atan2(-d.x, -d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    let dy = yaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    p.yaw += dy * Math.min(1, k * dt);
    p.pitch = damp(p.pitch, pitch, k, dt);
  }

  // マップを切り替えて、プレイヤーを置く
  setMap(id, x, z, yaw, y) {
    const g = this.g;
    for (const o of this.extra) g.scene.remove(o);
    this.extra = [];
    g.enemies.clear(); g.combat.clear(); g.echo.reset();
    g.world.load(id);
    const b = g.player.body;
    b.pos.set(x, y ?? this.ground(x, z, 0) + 0.02, z); b.vel.set(0, 0, 0);
    g.player.yaw = yaw; g.player.pitch = -0.03;
    g.player.alive = true; g.player.health = 999;
    this.cutT = this.T;
  }

  place(x, z, yaw) {
    const b = this.g.player.body;
    b.pos.set(x, this.ground(x, z, 0) + 0.02, z); b.vel.set(0, 0, 0);
    this.g.player.yaw = yaw; this.g.player.pitch = -0.03; this.cutT = this.T;
  }

  spawn(type, x, z, opts = {}) {
    const y = (opts.y ?? 0) + this.ground(x, z, 0) + 0.05;
    const e = this.g.enemies.spawn(type, new THREE.Vector3(x, y, z), { instant: true, yaw: opts.yaw });
    if (opts.hp) e.hp = opts.hp;
    return e;
  }

  freeCam(fn) {
    const g = this.g;
    g.weapons.root.visible = false;
    g.camHook = () => {
      g.weapons.root.visible = false;
      const r = fn(this.T - this.shotT);
      g.camera.position.copy(r.pos);
      g.camera.up.set(0, 1, 0);
      g.camera.lookAt(r.look);
      g.camera.fov = r.fov || 60; g.camera.updateProjectionMatrix();
      g.camera.updateMatrixWorld(true);
    };
  }
  fpsCam() { this.g.camHook = null; this.g.weapons.root.visible = true; }

  addLight(color, intensity, dist, pos) {
    const l = new THREE.PointLight(color, intensity, dist, 1.4); l.position.copy(pos);
    this.g.scene.add(l); this.extra.push(l); return l;
  }

  // ---- 場面（ショット） ----
  shots() {
    const g = this.g, wp = g.weapons, p = g.player;
    return [
      { t: 0, tag: '', enter: () => {
        this.setMap('neon', 0, 30, 0, 5.01);
        for (let i = 0; i < 6; i++) this.spawn('trooper', -20 + i * 8, -20 + (i % 2) * 12);
        this.freeCam((t) => { const a = 0.6 + t * 0.09; return { pos: _c.set(Math.cos(a) * 80, 46 - t * 4, Math.sin(a) * 80).clone(), look: new THREE.Vector3(0, 4, 0), fov: 50 }; });
      } },
      { t: BAR * 2, tag: 'NEW MAP', cap: 'SKYLINE ─ 青空の市街地', col: '#3e9bff', enter: () => {
        this.setMap('skyline', -4.5, -22, 0);
        this.fpsCam(); wp.select(0); wp.cur = 0; this.hold('fwd', true);
        g.settings.fov = 88;
      }, update: (t, dt) => { p.pitch = damp(p.pitch, -0.02, 4, dt); p.yaw = damp(p.yaw, Math.sin(t * 2) * 0.05, 3, dt); } },
      { t: BAR * 3, tag: 'NEW MAP', cap: '動く足場・加速レーン・走る電車', col: '#3e9bff', enter: () => {
        this.releaseAll();
        this.freeCam((t) => { const k = t / BAR; return { pos: new THREE.Vector3(2 + k * 4, 16 + k * 5, 30 - k * 26), look: new THREE.Vector3(30 + k * 10, 3, -80), fov: 55 }; });
      } },
      { t: BAR * 4, tag: 'WEAPON', cap: 'グラビティ砲：まとめて吸い込んで爆発', col: '#c06bff', big: 'GRAVITY', enter: () => {
        this.setMap('neon', -15, -2, Math.PI);
        this.fpsCam(); g.settings.fov = 84;
        wp.cur = 8; wp.models.forEach((m, i) => { m.group.visible = i === 8; }); wp.switchT = 0; wp.reloadT = 0; wp.cooldown = 0; wp.st.ammo = wp.def.mag;
        const c = new THREE.Vector3(-15, 0, 9); this.cluster = c;
        for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = 3.2 + (i % 2) * 2.8; this.spawn(i === 3 ? 'drone' : 'trooper', c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, { hp: 50, y: i === 3 ? 3 : 0 }); }
        this.fired = false;
      }, update: (t, dt) => {
        this.aimAt(_c.copy(this.cluster).setY(0.7), 9, dt);
        if (!this.fired && t > 0.08) { this.fired = true; wp.cooldown = 0; wp.fire(p); }
        if (t > 1.45 && !this.slowed) { this.slowed = true; g.slowmo(0.7); }
      } },
      { t: BAR * 5, tag: 'GIMMICK', cap: '撃てば連鎖：爆発ドラム缶', col: '#ff7a2a', enter: () => {
        this.slowed = false;
        g.world.load('neon');
        this.place(92, 44, 0); this.fpsCam();
        wp.cur = 0; wp.models.forEach((m, i) => { m.group.visible = i === 0; }); wp.st.ammo = wp.def.mag;
        for (const [x, z] of [[94, 32], [90, 31], [104, 38], [97, 36]]) this.spawn('trooper', x, z, { hp: 60 });
        this.shotBarrel = false;
      }, update: (t, dt) => {
        const br = g.world.barrels.find((b) => b.alive && Math.abs(b.pos.x - 92) < 2 && Math.abs(b.pos.z - 30) < 2);
        if (br) this.aimAt(_c.copy(br.pos).setY(br.pos.y + 0.6), 10, dt);
        if (!this.shotBarrel && t > 0.45 && br) {
          this.shotBarrel = true;
          const o = g.camera.position.clone(), d = _c.copy(br.pos).setY(br.pos.y + 0.6).sub(o).normalize();
          wp.fire(p);
          g.combat.fireShot(wp.defs[0], o, d.clone(), o.clone(), 'player', { spread: 0 });
        }
      } },
      { t: BAR * 6, tag: 'SHADOW ECHO', cap: '5秒前の自分が「影」になって共闘する', col: '#3ee8ff', big: 'SHADOW ECHO', enter: () => {
        g.world.load('neon');
        this.place(-24, 14, Math.PI);
        for (let i = 0; i < 5; i++) this.spawn('trooper', -30 + i * 4, 32 + (i % 2) * 3, { hp: 40 });
        // 5秒ぶんの「過去の動き」を作って、影に再生させる
        const fr = [], now = g.time, N = 300;
        for (let i = 0; i < N; i++) {
          const k = i / (N - 1);
          const x = -30 + k * 14, z = 16 - Math.sin(k * Math.PI) * 3;
          const shots = i % 7 === 0 && k > 0.15 ? [{ w: 0, d: new THREE.Vector3(-0.1 + k * 0.1, -0.02, 1).normalize() }] : [];
          fr.push({ t: now - 5 + k * 5, x, y: 0.02, z, yaw: Math.PI, pitch: 0, h: 1.8, shots });
        }
        g.echo.frames = fr;
        g.echo.activate();
        this.freeCam((t) => { const e = g.echo.pos; return { pos: new THREE.Vector3(e.x + 1 - t * 0.6, 1.3, e.z + 7.5), look: new THREE.Vector3(e.x - 0.5, 1.1, e.z), fov: 46 }; });
      } },
      { t: BAR * 8, tag: 'AGENTS', cap: '人型になった4人のエージェント', col: '#ffffff', enter: () => {
        g.echo.reset();
        g.enemies.clear();
        const ids = ['vector', 'haken', 'nox', 'boulder'];
        this.lineup = ids.map((id, i) => {
          const av = g.avatars.create(getCharacter(id));
          av.root.position.set(-21 + i * 2, 0.02, -2);
          av.root.rotation.y = Math.PI;
          av.play(i % 2 ? 'Relax' : 'Idle', 0); av.mixer.update(i * 0.3);
          g.scene.add(av.root); this.extra.push(av.root);
          return av;
        });
        this.addLight(0xffffff, 60, 18, new THREE.Vector3(-18, 5, 4));
        this.addLight(0x3ee8ff, 30, 14, new THREE.Vector3(-24, 3, -6));
        this.freeCam((t) => { const a = -0.5 + t * 0.32; return { pos: new THREE.Vector3(-18 + Math.sin(a) * 7.5, 1.6 + t * 0.15, -2 + Math.cos(a) * 7.5), look: new THREE.Vector3(-18, 1.05, -2), fov: 40 }; });
      }, update: (t, dt) => { for (const av of this.lineup || []) av.mixer.update(dt); } },
      { t: BAR * 9, tag: 'BOSS STAGE', cap: 'ボス専用ステージ「CORE ARENA」', col: '#ff2b4a', big: 'BOSS', enter: () => {
        this.setMap('core', 0, 40, 0);
        this.fpsCam(); g.settings.fov = 84;
        wp.cur = 0; wp.models.forEach((m, i) => { m.group.visible = i === 0; }); wp.st.ammo = wp.def.mag;
        this.boss = this.spawn('boss', 0, 29, { yaw: Math.PI });
        this.addLight(0xdfe6ff, 140, 34, new THREE.Vector3(0, 7, 30));
        this.addLight(0xff3a5a, 90, 22, new THREE.Vector3(0, 10, 24));
        g.player.ultMeter = 100;
      }, update: (t, dt) => {
        if (!this.boss) return;
        this.aimAt(this.boss.center(_c).setY(_c.y + 0.6), 6, dt);
        this.hold('fire', t > 0.35 && t < BAR - 0.1);
        this.hold('ads', t > 0.3 && t < 1.2);
        if (t > 0.6 && !this.ultDone) { this.ultDone = true; p.ultMeter = 100; p.activateUlt(); }
      } },
      { t: BAR * 10, tag: 'BOSS STAGE', cap: '沈む柱と回転レーザー', col: '#ff2b4a', enter: () => {
        this.releaseAll();
        this.freeCam((t) => { const a = 1.2 + t * 0.4; const b = this.boss ? this.boss.body.pos : new THREE.Vector3(); return { pos: new THREE.Vector3(b.x + Math.cos(a) * 14, 2.2 + t * 1.6, b.z + Math.sin(a) * 14), look: new THREE.Vector3(b.x, 3.4, b.z), fov: 55 }; });
      } },
      { t: BAR * 11, tag: '', end: true, enter: () => {
        this.releaseAll();
        this.freeCam((t) => ({ pos: new THREE.Vector3(Math.sin(t * 0.12) * 46, 14 + t * 3, Math.cos(t * 0.12) * 46), look: new THREE.Vector3(0, 6, 0), fov: 52 }));
      } },
    ];
  }

  async start({ record = false, upload = null } = {}) {
    const g = this.g;
    g.noAutoPause = true;
    g.charId = 'vector';
    g.profile.level = Math.max(g.profile.level, 10);
    g.audio.init();
    g.mapSel = 'neon';
    g.startMode('wave');
    g.waves.update = () => {};
    g.player.takeDamage = () => {};
    g.weapons.reset([0, 8]);
    g.weapons.setArms(g.player.char);
    g.input.enabled = true;
    document.body.classList.add('trailer');
    this.canvas.style.display = 'block';
    this.list = this.shots();
    this.idx = -1; this.T = -0.3; this.running = true; this.cutT = undefined;
    this.ultDone = false; this.slowed = false; this.boss = null;
    g.audio.master.gain.value = 0.42; // 効果音を少し下げて BGM を聞かせる
    const ac = g.audio.ctx;
    this.t0 = ac.currentTime + 0.35;

    if (record) {
      const stream = this.canvas.captureStream(0);
      this.vtrack = stream.getVideoTracks()[0];
      const dest = ac.createMediaStreamDestination();
      g.audio.out.connect(dest);
      for (const tk of dest.stream.getAudioTracks()) stream.addTrack(tk);
      const mime = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      this.chunks = [];
      this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 });
      this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.rec.start(500);
      this.mime = mime;
    } else this.vtrack = null;
    music(ac, g.audio.out, this.t0);

    g.trailerHook = (dt) => this.step(dt);
    g.afterRender = () => this.draw();
    await new Promise((res) => { this.finish = res; });
    if (!this.rec) return { ok: true };
    await new Promise((r) => { this.rec.onstop = r; this.rec.stop(); });
    const blob = new Blob(this.chunks, { type: this.mime.split(';')[0] });
    this.blob = blob; this.rec = null;
    let up = null;
    if (upload) up = await fetch(upload, { method: 'POST', body: blob }).then((r) => r.status).catch((e) => String(e));
    return { size: blob.size, mime: this.mime, upload: up };
  }

  step(dt) {
    const g = this.g;
    this.T = g.audio.ctx.currentTime - this.t0;
    const T = this.T;
    while (this.idx + 1 < this.list.length && T >= this.list[this.idx + 1].t) {
      this.idx++;
      this.shotT = this.list[this.idx].t;
      this.list[this.idx].enter();
    }
    if (this.idx < 0 && !this.preEntered) { this.preEntered = true; this.idx = 0; this.shotT = 0; this.list[0].enter(); }
    const s = this.list[Math.max(0, this.idx)];
    if (s.update) s.update(T - s.t, dt);
    g.player.health = 999;
    if (T >= END + 0.2 && this.running) this.stop();
  }

  stop() {
    const g = this.g;
    this.running = false;
    this.releaseAll();
    g.trailerHook = null; g.camHook = null;
    for (const o of this.extra) g.scene.remove(o);
    this.extra = [];
    g.audio.master.gain.value = g.audio.volume;
    setTimeout(() => { g.afterRender = null; document.body.classList.remove('trailer'); this.preEntered = false; if (this.finish) this.finish(); }, 150);
  }

  // ---- 文字・演出を重ねて録画用キャンバスに描く ----
  draw() {
    const g = this.g, x = this.ctx, T = this.T;
    x.drawImage(g.renderer.domElement, 0, 0, W, H);
    const s = this.list[Math.max(0, this.idx)];
    const lt = T - s.t;
    const beat = ((T % BEAT) + BEAT) % BEAT / BEAT;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const ease = (v) => 1 - Math.pow(1 - clamp01(v), 3);

    // カットの瞬間の白い光
    if (this.cutT !== undefined && T >= this.cutT && T - this.cutT < 0.18) {
      x.fillStyle = `rgba(255,255,255,${0.5 * (1 - (T - this.cutT) / 0.18)})`; x.fillRect(0, 0, W, H);
    }
    // サビ中は拍に合わせてわずかに明滅
    if (T > BAR * 4 && T < BAR * 11) { x.fillStyle = `rgba(255,255,255,${0.05 * (1 - beat)})`; x.fillRect(0, 0, W, H); }

    // 映画風の上下の帯
    x.fillStyle = '#000'; x.fillRect(0, 0, W, 30); x.fillRect(0, H - 30, W, 30);

    // タイトル
    if (T < BAR * 2) {
      const a = clamp01((T - 0.4) / 0.6) * clamp01((BAR * 2 - T) / 0.3);
      this.logo(W / 2, H / 2 - 30, 100 + (1 - ease((T - 0.4) / 0.8)) * 40, a);
      x.save(); x.globalAlpha = clamp01((T - 1.4) / 0.4) * clamp01((BAR * 2 - T) / 0.3);
      x.textAlign = 'center'; x.font = '700 28px Orbitron, sans-serif'; x.fillStyle = '#ffb02e'; x.shadowColor = '#ffb02e'; x.shadowBlur = 12;
      x.fillText('v0.3  UPDATE', W / 2, H / 2 + 60);
      x.font = '700 22px "Noto Sans JP"'; x.fillStyle = '#fff'; x.shadowBlur = 0;
      x.fillText('新マップ ・ ボスステージ ・ 影のECHO', W / 2, H / 2 + 100);
      x.restore();
    }

    // 章タグ（左上）と説明（左下）
    if (s.tag && !s.end) {
      const k = ease(lt / 0.25);
      x.save();
      x.globalAlpha = k;
      x.font = '900 18px Orbitron, sans-serif';
      const tw = x.measureText(s.tag).width;
      x.fillStyle = s.col || '#3ee8ff'; x.fillRect(48, 56, tw + 28, 30);
      x.fillStyle = '#05030f'; x.fillText(s.tag, 62, 78);
      x.restore();
    }
    if (s.cap) {
      const k = ease((lt - 0.08) / 0.3);
      x.save();
      x.globalAlpha = k;
      x.font = '900 38px "Noto Sans JP"';
      const w = x.measureText(s.cap).width;
      const px = 60 - (1 - k) * 40, py = H - 96;
      x.fillStyle = 'rgba(5,3,15,.72)'; x.fillRect(px - 18, py - 44, w + 36, 62);
      x.fillStyle = s.col || '#ff3ad8'; x.fillRect(px - 18, py - 44, 6, 62);
      x.fillStyle = '#fff'; x.fillText(s.cap, px, py);
      x.restore();
    }
    // 大きな単語（拍に合わせて飛び込む）
    if (s.big) {
      const k = clamp01(lt / 0.22), out = clamp01((BAR * (s.big === 'SHADOW ECHO' ? 2 : 1) - lt) / 0.25);
      if (lt < 1.2) {
        x.save();
        x.globalAlpha = Math.min(1, k) * clamp01((1.2 - lt) / 0.35) * out;
        const sc = 1.5 - ease(k) * 0.5;
        x.translate(W / 2, H / 2 - 120); x.scale(sc, sc);
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = '900 96px Orbitron, sans-serif';
        x.shadowColor = s.col || '#fff'; x.shadowBlur = 30;
        x.fillStyle = '#fff'; x.fillText(s.big, 0, 0);
        x.restore();
      }
    }
    // エージェント名
    if (s.tag === 'AGENTS') {
      const names = [['VECTOR', '#3ee8ff'], ['HAKEN', '#9d7bff'], ['NOX', '#ff3ad8'], ['BOULDER', '#ffb02e']];
      x.save(); x.textAlign = 'right'; x.font = '900 30px Orbitron, sans-serif';
      names.forEach(([n, c], i) => {
        const k = ease((lt - i * BEAT * 0.5) / 0.2);
        x.globalAlpha = k; x.fillStyle = c; x.shadowColor = c; x.shadowBlur = 14;
        x.fillText(n, W - 60 + (1 - k) * 60, 120 + i * 44);
      });
      x.restore();
    }

    // 締め
    if (s.end) {
      const a = clamp01(lt / 0.6);
      x.fillStyle = `rgba(5,3,15,${0.8 * a})`; x.fillRect(0, 0, W, H);
      this.logo(W / 2, H / 2 - 90, 100, a);
      x.save(); x.textAlign = 'center';
      x.globalAlpha = clamp01((lt - 0.5) / 0.5);
      x.font = '700 26px Orbitron, sans-serif'; x.fillStyle = '#ffb02e'; x.fillText('v0.3  UPDATE', W / 2, H / 2 - 20);
      x.globalAlpha = clamp01((lt - 0.9) / 0.5);
      x.font = '700 30px "Noto Sans JP"'; x.fillStyle = '#fff';
      x.fillText('3つのマップ ・ 影のECHO ・ 9種の武器', W / 2, H / 2 + 30);
      x.globalAlpha = clamp01((lt - 1.3) / 0.5);
      x.fillText('無料 ・ インストール不要 ｜ PC・スマホ対応', W / 2, H / 2 + 76);
      x.globalAlpha = clamp01((lt - 1.8) / 0.5);
      x.font = '700 32px Orbitron, sans-serif'; x.fillStyle = '#3ee8ff'; x.shadowColor = '#3ee8ff'; x.shadowBlur = 16;
      x.fillText(URL_TEXT, W / 2, H / 2 + 140);
      x.restore();
      if (T > END - 0.8) { x.fillStyle = `rgba(0,0,0,${clamp01((T - (END - 0.8)) / 0.8)})`; x.fillRect(0, 0, W, H); }
    }
    if (this.vtrack && this.vtrack.requestFrame) this.vtrack.requestFrame();
  }

  logo(cx, cy, size, alpha) {
    const x = this.ctx;
    if (alpha <= 0) return;
    x.save();
    x.globalAlpha = alpha;
    x.textBaseline = 'middle';
    x.font = `900 ${size}px Orbitron, sans-serif`;
    const a = 'ECHO', s = '//', b = 'BREAK';
    const wa = x.measureText(a).width, ws = x.measureText(s).width, wb = x.measureText(b).width;
    let px = cx - (wa + ws + wb) / 2;
    x.shadowBlur = 26;
    x.shadowColor = '#3ee8ff'; x.fillStyle = '#fff'; x.fillText(a, px, cy); px += wa;
    x.shadowColor = '#ff3ad8'; x.fillStyle = '#ff3ad8'; x.fillText(s, px, cy); px += ws;
    x.shadowColor = '#3ee8ff'; x.fillStyle = '#fff'; x.fillText(b, px, cy);
    x.restore();
  }
}
