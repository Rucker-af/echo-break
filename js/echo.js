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
    this.mesh.visible = true;
    const f = this.play[0];
    this.pos.set(f.x, f.y, f.z);
    this.chest.set(f.x, f.y + 1.2, f.z);
    for (const e of g.enemies.list) e.preferEcho = Math.random() < 0.7;
    g.effects.burst(this.chest, 0x9d7bff, 60, 8, 0.15, 0.7);
    g.effects.ring(_v.set(f.x, f.y + 0.1, f.z), 0x9d7bff, 4, 0.6);
    g.effects.tracer(g.player.chest.clone(), this.chest.clone(), 0x9d7bff, 0.05, 0.4);
    g.audio.play('echo');
    g.ui.flash('rgba(157,123,255,0.35)');
    g.ui.echoBanner();
    g.emit('echo');
    return true;
  }

  // 記録された狙いの近くに敵がいれば、そちらへ少し吸い付ける
  assist(origin, dir) {
    const g = this.game;
    let best = null, bestDot = Math.cos(0.28);
    for (const e of g.enemies.list) {
      if (!e.isActive()) continue;
      e.center(_c);
      _v.subVectors(_c, origin);
      const d = _v.length();
      if (d > 80) continue;
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
          g.combat.fireShot(def, eye.clone(), dir, muzzle, 'echo', { spread: def.spread * 0.6 });
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
    this.mesh.scale.y = h / 1.8;
    this.gun.rotation.x = -b.pitch * 0.5;
    this.ring.rotation.z += dt * 3;
    const remain = P[P.length - 1].t - local;
    this.mat.uniforms.uAlpha.value = remain < 0.6 ? 0.6 + Math.sin(g.time * 40) * 0.4 : 1;
    if (Math.random() < 0.7) g.effects.spawn(this.pos.x + (Math.random() - 0.5) * 0.6, this.pos.y + Math.random() * h, this.pos.z + (Math.random() - 0.5) * 0.6, 0, 0.6, 0, 0x9d7bff, 0.1, 0.6);
    if (this.idx >= P.length) this.end();
  }

  end() {
    const g = this.game;
    this.active = false;
    this.mesh.visible = false;
    g.combat.explode(this.chest.clone(), 7, 110, 'echo', 0x9d7bff);
    g.audio.play('echoEnd');
    for (const e of g.enemies.list) e.preferEcho = false;
    g.emit('echoEnd');
  }
}
