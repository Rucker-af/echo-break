// ECHOシステム：直近5秒の動きと射撃を記録し、ホログラムとして再生する（このゲームのオリジナル要素）
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const HOLO_V = `varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const HOLO_F = `uniform float uTime; uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
  float scan = 0.55 + 0.45 * sin(vW.y * 38.0 - uTime * 9.0);
  float glitch = step(0.97, fract(sin(floor(uTime*12.0 + vW.y*3.0))*43758.5));
  float a = (0.12 + f * 0.95) * scan * uAlpha + glitch * 0.3;
  gl_FragColor = vec4(uColor * (0.7 + f * 2.6), a); }`;

const DURATION = 5;
const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3();

export class EchoSystem {
  constructor(game) {
    this.game = game;
    this.frames = [];
    this.pendingShots = [];
    this.active = false;
    this.pos = new THREE.Vector3();
    this.chest = new THREE.Vector3();
    this.target = { pos: this.pos, chest: this.chest, vel: new THREE.Vector3(), isEcho: true };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: HOLO_V, fragmentShader: HOLO_F,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x9d7bff) }, uAlpha: { value: 1 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.mesh = this.buildMesh();
    this.mesh.visible = false;
    game.scene.add(this.mesh);
  }

  buildMesh() {
    const g = new THREE.Group();
    const m = this.mat;
    const add = (geo, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    add(new THREE.CapsuleGeometry(0.28, 0.6, 4, 12), 0, 1.15, 0);
    add(new THREE.SphereGeometry(0.19, 16, 12), 0, 1.72, 0);
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.1, 0.65, 3, 8), s * 0.15, 0.45, 0);
    add(new THREE.CapsuleGeometry(0.08, 0.45, 3, 8), -0.32, 1.15, -0.05).rotation.x = 0.4;
    const arm = add(new THREE.CapsuleGeometry(0.08, 0.4, 3, 8), 0.3, 1.35, -0.25); arm.rotation.x = Math.PI / 2;
    this.gun = add(new THREE.BoxGeometry(0.09, 0.11, 0.6), 0.28, 1.4, -0.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.02, 6, 40), m);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    this.ring = ring;
    return g;
  }

  reset() {
    this.frames = []; this.pendingShots = [];
    this.active = false; this.mesh.visible = false;
    if (this.av) this.av.root.visible = false;
    if (this.av2) this.av2.root.visible = false;
    this.veil = false; this.taunt = false; this.canSwap = false;
  }

  addShot(weaponIndex, dir) { this.pendingShots.push({ w: weaponIndex, d: dir.clone() }); }

  record(t) {
    const p = this.game.player;
    this.frames.push({ t, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, h: p.body.h, shots: this.pendingShots });
    this.pendingShots = [];
    while (this.frames.length && this.frames[0].t < t - DURATION) this.frames.shift();
  }

  recSeconds() { return this.frames.length ? Math.min(DURATION, this.frames[this.frames.length - 1].t - this.frames[0].t) : 0; }

  activate() {
    const g = this.game;
    if (this.frames.length < 20) return false;
    this.play = this.frames.slice();
    this.base = this.play[0].t;
    this.startT = g.time;
    this.idx = 0;
    this.active = true;
    this.kills = 0;
    this.char = g.player.char;
    this.mat.uniforms.uColor.value.set(this.char.color).lerp(new THREE.Color(0x9d7bff), 0.35);
    this.useAvatar();
    this.mesh.visible = true;
    const f = this.play[0];
    this.pos.set(f.x, f.y, f.z);
    this.chest.set(f.x, f.y + 1.2, f.z);
    const id = this.char.id;
    // キャラごとの影スキル
    this.veil = id === 'nox';
    this.taunt = id === 'boulder' || id === 'nox';
    this.canSwap = id === 'haken';
    for (const e of g.enemies.list) e.preferEcho = this.taunt || Math.random() < 0.7;
    if (this.av) this.av.root.scale.setScalar(id === 'boulder' ? 1.4 : 1);
    if (id === 'vector') this.useTwin(); else if (this.av2) this.av2.root.visible = false;
    if (this.canSwap) g.ui.toast('もう一度 ECHO で影と入れ替わる');
    if (this.veil) g.ui.toast('闇に溶けた：敵に狙われない');
    const cc = this.char.color;
    g.effects.burst(this.chest, cc, 60, 8, 0.15, 0.7);
    g.effects.ring(_v.set(f.x, f.y + 0.1, f.z), 0x9d7bff, 4, 0.6);
    g.effects.tracer(g.player.chest.clone(), this.chest.clone(), 0x9d7bff, 0.05, 0.4);
    g.audio.play('echo');
    g.ui.flash('rgba(157,123,255,0.35)');
    g.ui.echoBanner(this.char.echoTag || 'ECHO');
    g.emit('echo');
    return true;
  }

  // VECTOR：もう1体の影（左右に並ぶ）
  useTwin() {
    const g = this.game;
    if (!this.av2) {
      this.av2 = g.avatars.create(this.char, { holo: true });
      if (!this.av2) return;
      g.scene.add(this.av2.root);
    }
    this.av2.root.visible = true;
    this.av2.play('Idle', 0);
    this.twinSide = 1.7;
  }

  // HAKEN：影と居場所を入れ替える（1回だけ）
  trySwap() {
    if (!this.active || !this.canSwap) return false;
    const g = this.game, p = g.player, b = p.body;
    this.canSwap = false;
    const from = p.chest.clone();
    const to = this.chest.clone();
    b.pos.set(this.pos.x, this.pos.y + 0.05, this.pos.z);
    b.vel.set(0, 2, 0);
    g.effects.burst(from, this.char.color, 40, 7, 0.12, 0.5);
    g.effects.burst(to, this.char.color, 40, 7, 0.12, 0.5);
    g.effects.tracer(from, to, this.char.color, 0.08, 0.4);
    g.audio.play('dash', 1);
    g.ui.flash('rgba(157,123,255,0.3)');
    this.arcBurst(to);
    return true;
  }

  // 選んだキャラのアバターを半透明のホログラムとして使う（読み込めなければ従来の人形）
  useAvatar() {
    const g = this.game;
    if (this.av) { g.scene.remove(this.av.root); this.av = null; }
    this.avCache = this.avCache || {};
    let av = this.avCache[this.char.id];
    if (!av) { av = g.avatars.create(this.char, { holo: true }); if (av) this.avCache[this.char.id] = av; }
    if (!av) return;
    this.av = av;
    g.scene.add(av.root);
    av.root.visible = true;
    av.play('Idle', 0);
    for (const c of this.mesh.children) if (c !== this.ring) c.visible = false;
    this.lastPos = null;
  }

  // 記録された狙いの近くに敵がいれば、そちらへ少し吸い付ける
  assist(origin, dir) {
    const g = this.game;
    const nox = this.char && this.char.id === 'nox';
    let best = null, bestDot = Math.cos(nox ? 0.6 : 0.28);
    for (const e of g.enemies.list) {
      if (!e.isActive()) continue;
      e.center(_c);
      _v.subVectors(_c, origin);
      const d = _v.length();
      if (d > (nox ? 140 : 80)) continue;
      const dot = _v.dot(dir) / d;
      if (dot > bestDot && g.world.los(origin, _c)) { bestDot = dot; best = _v.clone().divideScalar(d); }
    }
    return best || dir;
  }

  update(dt) {
    this.mat.uniforms.uTime.value += dt;
    if (!this.active) return;
    const g = this.game;
    const local = this.base + (g.time - this.startT);
    const P = this.play;
    while (this.idx < P.length && P[this.idx].t <= local) {
      const f = P[this.idx];
      if (f.shots.length) {
        const eye = _m.set(f.x, f.y + (f.h < 1.5 ? 0.95 : 1.62), f.z);
        for (const s of f.shots) {
          const def = WEAPONS[s.w];
          const dir = this.assist(eye, s.d);
          const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
          const muzzle = new THREE.Vector3(eye.x + cy * 0.28 - sy * 0.55, eye.y - 0.2, eye.z - sy * 0.28 - cy * 0.55);
          g.combat.fireShot(def, eye.clone(), dir, muzzle, 'echo', { spread: def.spread * (this.char && this.char.id === 'nox' ? 0.1 : 0.6) });
          // VECTOR：もう1体の影も撃つ
          if (this.av2 && this.av2.root.visible) {
            const e2 = eye.clone(); e2.x -= cy * this.twinSide; e2.z += sy * this.twinSide;
            const d2 = this.assist(e2, s.d);
            const m2 = muzzle.clone(); m2.x -= cy * this.twinSide; m2.z += sy * this.twinSide;
            g.combat.fireShot(def, e2, d2, m2, 'echo', { spread: def.spread * 0.6 });
            g.effects.flash(m2, def.color, 3, 0.05);
          }
          g.effects.flash(muzzle, def.color, 3, 0.05);
          g.audio.play(def.sound, 0.45);
        }
      }
      this.idx++;
    }
    const i1 = Math.min(this.idx, P.length - 1), i0 = Math.max(0, i1 - 1);
    const a = P[i0], b = P[i1];
    const k = b.t > a.t ? Math.min(1, Math.max(0, (local - a.t) / (b.t - a.t))) : 1;
    this.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    const h = a.h + (b.h - a.h) * k;
    this.chest.set(this.pos.x, this.pos.y + h * 0.68, this.pos.z);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = b.yaw;
    this.mesh.scale.y = this.av ? 1 : h / 1.8;
    if (this.av) {
      const av = this.av;
      av.root.position.copy(this.pos);
      av.root.rotation.y = b.yaw;
      const sp = this.lastPos ? Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z) / Math.max(dt, 1e-3) : 0;
      if (this.av2 && this.av2.root.visible) {
        const a2 = this.av2;
        a2.root.position.set(this.pos.x + Math.cos(b.yaw) * this.twinSide * -1, this.pos.y, this.pos.z + Math.sin(b.yaw) * this.twinSide);
        a2.root.rotation.y = b.yaw;
      }
      const vy = this.lastPos ? (this.pos.y - this.lastPos.y) / Math.max(dt, 1e-3) : 0;
      this.lastPos = (this.lastPos || new THREE.Vector3()).copy(this.pos);
      const anim = Math.abs(vy) > 3 ? 'Jump' : sp > 6 ? 'Running' : sp > 0.8 ? 'Walking' : 'Idle';
      av.play(anim, 0.15);
      av.mixer.timeScale = anim === 'Running' ? Math.min(1.6, sp / 8) : 1;
      av.mixer.update(dt);
      if (this.av2 && this.av2.root.visible) { this.av2.play(anim, 0.15); this.av2.mixer.timeScale = av.mixer.timeScale; this.av2.mixer.update(dt); }
    }
    this.gun.rotation.x = -b.pitch * 0.5;
    this.ring.rotation.z += dt * 3;
    const remain = P[P.length - 1].t - local;
    this.mat.uniforms.uAlpha.value = remain < 0.6 ? 0.6 + Math.sin(g.time * 40) * 0.4 : 1;
    // 影から立ちのぼる粒
    const cc = this.char ? this.char.color : 0x9d7bff;
    if (Math.random() < 0.8) g.effects.spawn(this.pos.x + (Math.random() - 0.5) * 0.7, this.pos.y + Math.random() * h, this.pos.z + (Math.random() - 0.5) * 0.7, 0, 0.9, 0, cc, 0.09, 0.7);
    // BOULDER：敵を引きつける波
    if (this.taunt && !this.veil && Math.floor(g.time * 1.25) !== this.tauntBeat) { this.tauntBeat = Math.floor(g.time * 1.25); g.effects.ring(_v.set(this.pos.x, this.pos.y + 0.1, this.pos.z), cc, 7, 0.6); }
    if (this.idx >= P.length) this.end();
  }

  // HAKEN のエコー：消えるときに周囲の敵へ電撃を連鎖させる
  arcBurst(at) {
    const g = this.game;
    const from = (at || this.chest).clone();
    const targets = g.enemies.list.filter((e) => e.isActive() && e.center(_c).distanceTo(from) < 16).slice(0, 5);
    for (const e of targets) {
      const c = e.center(new THREE.Vector3());
      g.effects.bolt(from, c, 0x9d7bff, 8, 0.9);
      const killed = e.damage(60, 'body', null, 'echo');
      g.onHitFeedback(e, 60, false, c, 'echo', killed);
    }
    if (targets.length) g.audio.play('arc', 1);
  }

  end() {
    const g = this.game;
    this.active = false;
    this.mesh.visible = false;
    if (this.av) this.av.root.visible = false;
    if (this.av2) this.av2.root.visible = false;
    this.veil = false; this.taunt = false; this.canSwap = false;
    const id = this.char ? this.char.id : '';
    const big = id === 'boulder';
    g.combat.explode(this.chest.clone(), big ? 12 : 7, big ? 190 : 110, 'echo', this.char ? this.char.color : 0x9d7bff);
    if (id === 'haken') this.arcBurst();
    g.audio.play('echoEnd');
    for (const e of g.enemies.list) e.preferEcho = false;
    g.emit('echoEnd');
  }
}
