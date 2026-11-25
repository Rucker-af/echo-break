// 敵：トルーパー / ドローン / ブルート / 訓練ターゲット。AI と敵の弾
import * as THREE from 'three';
import { rand, damp, dampAngle, clamp } from './utils.js';
import { GRAV } from './player.js';

export const TYPES = {
  trooper: { name: 'トルーパー', hp: 100, r: 0.45, h: 1.9, speed: 5.2, centerY: 1.15, score: 100, range: [9, 20], fly: false,
    hitboxes: [{ y: 1.74, r: 0.24, part: 'head' }, { y: 1.22, r: 0.47, part: 'body' }, { y: 0.55, r: 0.38, part: 'body' }],
    burst: 3, burstGap: 0.13, fireCD: [1.6, 2.6], shotSpeed: 34, dmg: 6, inacc: 0.9, shot: 'red', armor: 0x4a5366, glow: 0xff3344,
    muzzles: [[0.44, 1.22, 0.72]], knock: 1, explR: 2.2, drop: 0.3 },
  drone: { name: 'ドローン', hp: 55, r: 0.55, h: 1.1, speed: 9, centerY: 0.55, score: 150, fly: true,
    hitboxes: [{ y: 0.55, r: 0.64, part: 'body' }], burst: 1, burstGap: 0, fireCD: [1.1, 1.9], shotSpeed: 28, dmg: 7, inacc: 1.0,
    shot: 'pink', armor: 0x3a4050, glow: 0xff3ad8, muzzles: [[0, 0.57, 0.55]], knock: 1.6, explR: 2, drop: 0.25 },
  brute: { name: 'ブルート', hp: 420, r: 0.95, h: 3.0, speed: 3.4, centerY: 1.8, score: 400, range: [5, 14], fly: false,
    hitboxes: [{ y: 2.75, r: 0.4, part: 'head' }, { y: 1.95, r: 1.02, part: 'body' }, { y: 0.75, r: 0.78, part: 'body' }],
    burst: 2, burstGap: 0.35, fireCD: [2.4, 3.4], shotSpeed: 21, dmg: 22, splash: 4, inacc: 0.6, shot: 'orange', armor: 0x5e4c3c, glow: 0xff8a1e,
    muzzles: [[0.95, 2.45, 0.95], [-0.95, 2.45, 0.95]], knock: 0.25, explR: 4, drop: 1 },
  dummy: { name: 'ターゲット', hp: 60, r: 0.45, h: 1.9, speed: 0, centerY: 1.15, score: 0, fly: false, static: true,
    hitboxes: [{ y: 1.74, r: 0.24, part: 'head' }, { y: 1.22, r: 0.47, part: 'body' }, { y: 0.55, r: 0.38, part: 'body' }],
    armor: 0xc8a23a, glow: 0xffd23a, knock: 0, explR: 2, drop: 0 },
};

// 突撃して自爆する敵
TYPES.rusher = { name: 'ラッシャー', hp: 40, r: 0.45, h: 1.0, speed: 10.5, centerY: 0.5, score: 120, range: [0, 1.2], fly: false, melee: true,
  hitboxes: [{ y: 0.55, r: 0.58, part: 'body' }], armor: 0x3a2a2e, glow: 0xff3030, knock: 1.4, explR: 2.5, drop: 0.15 };
// ボス
TYPES.boss = { name: 'ウォーデン', hp: 2600, r: 1.5, h: 4.2, speed: 2.6, centerY: 2.6, score: 3000, range: [10, 24], fly: false, boss: true,
  hitboxes: [{ y: 3.9, r: 0.62, part: 'head' }, { y: 2.7, r: 1.5, part: 'body' }, { y: 1.0, r: 1.1, part: 'body' }],
  burst: 9, burstGap: 0.07, fireCD: [2.4, 3.2], shotSpeed: 24, dmg: 8, inacc: 1.4, shot: 'orange', armor: 0x2a2f3f, glow: 0xff2b4a,
  muzzles: [[1.33, 3.43, 1.33], [-1.33, 3.43, 1.33]], knock: 0.04, explR: 8, drop: 1 };

const GEO = {};
const geo = (k, f) => GEO[k] || (GEO[k] = f());
const B = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
function part(g, gm, mat, x, y, z) { const m = new THREE.Mesh(gm, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; }

function buildHumanoid(T, mats, big) {
  const g = new THREE.Group();
  const legs = [];
  if (!big) {
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.17, 0.9, 0); g.add(hip);
      part(hip, B(0.2, 0.5, 0.24), mats.armor, 0, -0.22, 0);
      part(hip, B(0.17, 0.45, 0.2), mats.dark, 0, -0.65, 0.02);
      part(hip, B(0.22, 0.08, 0.32), mats.dark, 0, -0.86, 0.05);
      legs.push(hip);
    }
    part(g, B(0.5, 0.25, 0.3), mats.dark, 0, 0.98, 0);
    part(g, B(0.66, 0.62, 0.4), mats.armor, 0, 1.33, 0);
    part(g, B(0.42, 0.06, 0.02), mats.glow, 0, 1.42, 0.205);
    part(g, B(0.08, 0.2, 0.02), mats.glow, 0, 1.25, 0.205);
    for (const s of [-1, 1]) part(g, B(0.26, 0.2, 0.36), mats.armor, s * 0.45, 1.58, 0);
    part(g, B(0.3, 0.26, 0.32), mats.dark, 0, 1.76, 0.02);
    part(g, B(0.27, 0.06, 0.02), mats.glow, 0, 1.78, 0.185);
    part(g, B(0.02, 0.2, 0.02), mats.dark, 0.1, 1.97, -0.08);
    if (!T.static) {
      part(g, B(0.12, 0.12, 0.34), mats.armor, 0.44, 1.3, 0.12);
      part(g, B(0.09, 0.09, 0.5), mats.dark, 0.44, 1.22, 0.42);
      part(g, B(0.1, 0.1, 0.04), mats.glow, 0.44, 1.22, 0.68);
      part(g, B(0.12, 0.5, 0.14), mats.armor, -0.45, 1.18, 0.05);
    } else {
      part(g, B(0.12, 0.55, 0.14), mats.armor, 0.45, 1.15, 0);
      part(g, B(0.12, 0.55, 0.14), mats.armor, -0.45, 1.15, 0);
      part(g, geo('dbase', () => new THREE.CylinderGeometry(0.6, 0.7, 0.08, 20)), mats.dark, 0, 0.04, 0);
      const ring = new THREE.Mesh(geo('dring2', () => new THREE.TorusGeometry(0.62, 0.025, 6, 32)), mats.glow);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.09; g.add(ring);
    }
  } else {
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.5, 1.35, 0); g.add(hip);
      part(hip, B(0.5, 0.7, 0.6), mats.armor, 0, -0.3, 0);
      part(hip, B(0.45, 0.6, 0.5), mats.dark, 0, -0.95, 0.05);
      part(hip, B(0.58, 0.16, 0.78), mats.dark, 0, -1.27, 0.1);
      legs.push(hip);
    }
    part(g, B(1.0, 0.4, 0.6), mats.dark, 0, 1.4, 0);
    part(g, B(1.6, 1.1, 1.0), mats.armor, 0, 2.05, 0);
    part(g, B(1.2, 0.3, 0.9), mats.dark, 0, 2.7, -0.05);
    part(g, geo('bcore', () => new THREE.SphereGeometry(0.22, 16, 12)), mats.glow, 0, 2.0, 0.5);
    part(g, B(0.5, 0.36, 0.5), mats.dark, 0, 2.8, 0.15);
    part(g, B(0.4, 0.07, 0.02), mats.glow, 0, 2.82, 0.41);
    for (const s of [-1, 1]) {
      part(g, B(0.42, 0.42, 0.55), mats.armor, s * 0.95, 2.45, 0.1);
      const bar = new THREE.Mesh(geo('bbar', () => new THREE.CylinderGeometry(0.12, 0.15, 0.7, 12)), mats.dark);
      bar.rotation.x = Math.PI / 2; bar.position.set(s * 0.95, 2.45, 0.6); bar.castShadow = true; g.add(bar);
      const tip = new THREE.Mesh(geo('btip', () => new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12)), mats.glow);
      tip.rotation.x = Math.PI / 2; tip.position.set(s * 0.95, 2.45, 0.96); g.add(tip);
      part(g, B(0.35, 0.95, 0.42), mats.armor, s * 1.02, 1.6, 0);
    }
  }
  return { group: g, legs };
}

function buildDrone(T, mats) {
  const g = new THREE.Group();
  part(g, geo('dcore', () => new THREE.SphereGeometry(0.42, 20, 14)), mats.armor, 0, 0.55, 0);
  part(g, geo('deye', () => new THREE.SphereGeometry(0.15, 12, 10)), mats.glow, 0, 0.57, 0.37);
  part(g, geo('dplate', () => new THREE.BoxGeometry(0.9, 0.08, 0.3)), mats.dark, 0, 0.82, -0.05);
  const ring = new THREE.Mesh(geo('dring', () => new THREE.TorusGeometry(0.68, 0.045, 8, 40)), mats.glow);
  ring.position.y = 0.55; ring.rotation.x = Math.PI / 2; g.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const f = part(g, B(0.08, 0.06, 0.45), mats.dark, Math.cos(a) * 0.5, 0.55, Math.sin(a) * 0.5);
    f.rotation.y = -a + Math.PI / 2;
  }
  const spike = new THREE.Mesh(geo('dspike', () => new THREE.ConeGeometry(0.1, 0.3, 8)), mats.glow);
  spike.position.y = 0.1; spike.rotation.x = Math.PI; g.add(spike);
  return { group: g, ring };
}

function buildRusher(T, mats) {
  const g = new THREE.Group();
  part(g, geo('rbody', () => new THREE.IcosahedronGeometry(0.48, 0)), mats.armor, 0, 0.6, 0);
  const core = part(g, geo('rcore', () => new THREE.SphereGeometry(0.26, 14, 10)), mats.glow, 0, 0.62, 0.22);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const sp = part(g, geo('rspike', () => new THREE.ConeGeometry(0.08, 0.32, 6)), mats.dark, Math.cos(a) * 0.42, 0.65 + Math.sin(a) * 0.3, Math.sin(a) * 0.1);
    sp.rotation.z = a - Math.PI / 2;
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.25, 0.4, 0); g.add(hip);
    part(hip, B(0.1, 0.4, 0.12), mats.dark, 0, -0.2, 0.05);
    legs.push(hip);
  }
  return { group: g, legs, core };
}

function buildBoss(T, mats) {
  const b = buildHumanoid(T, mats, true);
  const g = b.group;
  g.scale.setScalar(1.4);
  // 頭の角と、胸の大きなコア
  for (const s of [-1, 1]) {
    const horn = part(g, geo('bhorn', () => new THREE.ConeGeometry(0.12, 0.7, 8)), mats.glow, s * 0.3, 3.1, 0.05);
    horn.rotation.z = -s * 0.4;
  }
  part(g, geo('bcore2', () => new THREE.SphereGeometry(0.36, 18, 12)), mats.glow, 0, 2.0, 0.42);
  part(g, B(1.9, 0.12, 1.1), mats.glow, 0, 2.62, 0);
  return b;
}

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _a = new THREE.Vector3(), _m = new THREE.Vector3();

class Enemy {
  constructor(mgr, type, pos, opts) {
    const T = this.T = TYPES[type];
    this.mgr = mgr; this.type = type;
    this.hp = this.maxHp = T.hp * (opts.hpMul || 1);
    this.body = { pos: pos.clone(), vel: new THREE.Vector3(), r: T.r, h: T.h, onGround: false, wasGrounded: false, canStep: !T.fly, hitWall: false };
    const m = mgr.mats(type);
    this.armorMat = m.armor.clone();
    const mats = { armor: this.armorMat, dark: m.dark, glow: m.glow };
    const built = type === 'drone' ? buildDrone(T, mats) : type === 'rusher' ? buildRusher(T, mats)
      : type === 'boss' ? buildBoss(T, mats) : buildHumanoid(T, mats, type === 'brute');
    this.group = built.group; this.legs = built.legs || []; this.ring = built.ring;
    this.group.position.copy(pos);
    this.group.visible = false;
    this.state = 'spawn'; this.spawnT = 0.85;
    this.alive = true; this.flash = 0; this.stagger = 0;
    this.fireT = rand(1.2, 2.6); this.burst = 0; this.burstT = 0; this.mi = 0;
    this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = rand(1, 2.5);
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.hasLOS = false; this.losT = 0; this.noLosT = 0; this.goal = null;
    this.walk = Math.random() * 6; this.seed = Math.random() * 100;
    this.orbitA = Math.random() * Math.PI * 2; this.orbitR = rand(10, 17); this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.preferEcho = false;
    if (T.fly) this.body.pos.y = Math.max(pos.y, 4);
  }

  get pos() { return this.body.pos; }
  isActive() { return this.alive && this.state === 'active'; }
  center(out) { return out.set(this.body.pos.x, this.body.pos.y + this.T.centerY, this.body.pos.z); }

  damage(amount, part, dir, owner) {
    if (!this.isActive()) return false;
    this.hp -= amount;
    this.flash = 1;
    if (dir && this.T.knock) { this.body.vel.x += dir.x * amount * 0.03 * this.T.knock; this.body.vel.z += dir.z * amount * 0.03 * this.T.knock; }
    this.mgr.game.onEnemyDamaged(this, amount, owner);
    if (this.hp <= 0) { this.mgr.kill(this, owner, part === 'head'); return true; }
    return false;
  }

  knock(dir, f) {
    if (!this.T.knock) return;
    this.body.vel.addScaledVector(dir, f * this.T.knock);
    if (!this.T.fly) this.body.vel.y += f * 0.35 * this.T.knock;
  }

  update(dt) {
    const g = this.mgr.game, T = this.T, b = this.body;
    if (this.state === 'spawn') {
      this.spawnT -= dt;
      if (Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2;
        g.effects.spawn(b.pos.x + Math.cos(a) * T.r * 1.5, b.pos.y + Math.random() * T.h, b.pos.z + Math.sin(a) * T.r * 1.5, 0, 3, 0, T.glow, 0.12, 0.5);
      }
      if (this.spawnT <= 0) {
        this.state = 'active'; this.group.visible = true;
        g.effects.burst(this.center(_c), T.glow, 30, 6, 0.15, 0.5);
        g.effects.ring(_c.set(b.pos.x, b.pos.y + 0.1, b.pos.z), T.glow, 2.5, 0.4);
      }
      return;
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    const sc = this.mgr.scanT > 0 ? 0.35 + Math.sin(g.time * 8) * 0.15 : 0;
    this.armorMat.emissive.setRGB(this.flash * 1.4 + sc, this.flash * 1.2 + sc * 0.15, this.flash * 1.1 + sc * 0.8);
    this.updateMarker();
    this.stagger = Math.max(0, this.stagger - dt);

    if (T.static) {
      this.yaw += dt * 0.6;
      b.vel.x = damp(b.vel.x, 0, 4, dt); b.vel.z = damp(b.vel.z, 0, 4, dt);
      b.vel.y -= GRAV * dt;
      b.wasGrounded = b.onGround; g.world.moveBody(b, dt);
    } else {
      const tgt = g.getTargetFor(this);
      this.losT -= dt;
      this.center(_c);
      if (this.losT <= 0) { this.losT = 0.2; this.hasLOS = g.world.los(_c, tgt.chest); }
      if (T.fly) this.updateDrone(dt, tgt); else this.updateGround(dt, tgt);
      if (T.melee) this.updateRusher(dt, tgt);
      else this.updateShooting(dt, tgt);
      if (T.boss) this.updateBoss(dt, tgt);
    }
    // アニメーション
    const hs = Math.hypot(b.vel.x, b.vel.z);
    this.walk += dt * hs * (this.type === 'brute' ? 1.6 : 2.6);
    const sw = Math.sin(this.walk) * Math.min(1, hs / 3) * 0.6;
    if (this.legs.length === 2) { this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw; }
    if (this.ring) this.ring.rotation.z += dt * 4;
    this.group.position.copy(b.pos);
    if (T.fly) this.group.position.y += Math.sin(g.time * 3 + this.seed) * 0.12;
    this.group.rotation.y = this.yaw;
    if (this.type === 'trooper' || this.type === 'brute') this.group.position.y += Math.abs(Math.sin(this.walk)) * 0.04 * Math.min(1, hs / 3);
  }

  updateGround(dt, tgt) {
    const g = this.mgr.game, T = this.T, b = this.body;
    const dx = tgt.pos.x - b.pos.x, dz = tgt.pos.z - b.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist, nz = dz / dist;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe = Math.random() < 0.2 ? 0 : (Math.random() < 0.5 ? -1 : 1); this.strafeT = rand(1.2, 2.8); }
    let mx, mz;
    if (!this.hasLOS) this.noLosT += dt; else { this.noLosT = 0; this.goal = null; }
    if (this.noLosT > 1.5 && !this.goal) {
      const a = Math.random() * Math.PI * 2, r = rand(10, 18);
      this.goal = new THREE.Vector3(clamp(tgt.pos.x + Math.cos(a) * r, -74, 74), 0, clamp(tgt.pos.z + Math.sin(a) * r, -74, 74));
    }
    if (this.goal) {
      const gx = this.goal.x - b.pos.x, gz = this.goal.z - b.pos.z, gd = Math.hypot(gx, gz);
      if (gd < 2) { this.goal = null; this.noLosT = 0; }
      mx = gx / (gd || 1); mz = gz / (gd || 1);
    } else {
      let desire = 0;
      if (dist > T.range[1]) desire = 1; else if (dist < T.range[0]) desire = -0.8;
      mx = nx * desire + (-nz) * this.strafe * 0.75;
      mz = nz * desire + nx * this.strafe * 0.75;
    }
    for (const o of this.mgr.list) {
      if (o === this || !o.alive) continue;
      const ox = b.pos.x - o.body.pos.x, oz = b.pos.z - o.body.pos.z;
      const d2 = ox * ox + oz * oz, sep = T.r + o.T.r + 1.2;
      if (d2 < sep * sep && d2 > 1e-4) { const d = Math.sqrt(d2); mx += ox / d * 0.9; mz += oz / d * 0.9; }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const sp = T.speed * (this.stagger > 0 ? 0.25 : 1) * (this.burst > 0 ? 0.5 : 1);
    const k = b.onGround ? 6 : 1;
    b.vel.x = damp(b.vel.x, mx * sp, k, dt);
    b.vel.z = damp(b.vel.z, mz * sp, k, dt);
    b.vel.y -= GRAV * dt;
    b.wasGrounded = b.onGround;
    g.world.moveBody(b, dt);
    if (b.hitWall) { this.strafe = -this.strafe || 1; this.strafeT = rand(0.8, 1.6); if (this.goal && Math.random() < 0.3) this.goal = null; }
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt);
    if (b.pos.y < -10) this.mgr.kill(this, 'world', false);
  }

  updateDrone(dt, tgt) {
    const g = this.mgr.game, T = this.T, b = this.body;
    this.orbitA += this.orbitDir * dt * (T.speed / this.orbitR) * 0.7;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = rand(2, 4); this.orbitR = rand(9, 17); if (Math.random() < 0.3) this.orbitDir *= -1; }
    const gx = tgt.pos.x + Math.cos(this.orbitA) * this.orbitR;
    const gz = tgt.pos.z + Math.sin(this.orbitA) * this.orbitR;
    const gy = Math.max(3.5, tgt.pos.y + 4 + Math.sin(g.time * 1.3 + this.seed) * 1.5);
    _v.set(gx - b.pos.x, gy - b.pos.y, gz - b.pos.z).multiplyScalar(1.5);
    const l = _v.length(); if (l > T.speed) _v.multiplyScalar(T.speed / l);
    const k = this.stagger > 0 ? 0.6 : 3;
    b.vel.x = damp(b.vel.x, _v.x, k, dt); b.vel.y = damp(b.vel.y, _v.y, k, dt); b.vel.z = damp(b.vel.z, _v.z, k, dt);
    b.wasGrounded = false;
    g.world.moveBody(b, dt);
    if (b.hitWall) this.orbitDir *= -1;
    this.yaw = dampAngle(this.yaw, Math.atan2(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z), 6, dt);
  }

  // ラッシャー：近づくと点滅して自爆
  updateRusher(dt, tgt) {
    const g = this.mgr.game;
    this.center(_c);
    const d = _c.distanceTo(tgt.chest);
    if (this.fuse === undefined && d < 2.6) {
      this.fuse = 0.5;
      g.audio.play('empty', 1);
    }
    if (this.fuse !== undefined) {
      this.fuse -= dt;
      this.body.vel.multiplyScalar(0.85);
      this.flash = (Math.floor(this.fuse * 20) % 2) ? 1 : 0;
      if (this.fuse <= 0) {
        const p = g.player;
        const pd = p.chest.distanceTo(_c);
        if (pd < 3.8 && p.alive) {
          const f = 1 - pd / 3.8;
          p.takeDamage(26 * g.diff.dmg * (0.4 + 0.6 * f), _c);
          p.body.vel.addScaledVector(_v.subVectors(p.chest, _c).normalize(), 9 * f);
        }
        this.mgr.kill(this, 'world', false);
      }
    }
  }

  // ボス：地面たたき（予告の輪のあと衝撃波）と、ドローン召喚
  updateBoss(dt, tgt) {
    const g = this.mgr.game, fx = g.effects, b = this.body;
    this.slamCD = (this.slamCD ?? 4) - dt;
    this.summonCD = (this.summonCD ?? 10) - dt;
    const dist = Math.hypot(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z);
    if (this.slamT !== undefined) {
      this.slamT -= dt;
      if (this.slamT <= 0) {
        this.slamT = undefined;
        const R = 10;
        fx.ring(_c.set(b.pos.x, b.pos.y + 0.2, b.pos.z), 0xff2b4a, R, 0.5);
        fx.explosion(_c.set(b.pos.x, b.pos.y + 0.5, b.pos.z), 4, 0xff2b4a, 1);
        g.audio.play('shock', 1); g.shake(0.6);
        const p = g.player;
        const pd = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
        if (pd < R && p.pos.y - b.pos.y < 1.2 && p.alive) {
          p.takeDamage(28 * g.diff.dmg, b.pos);
          p.body.vel.y = Math.max(p.body.vel.y, 9);
          p.body.vel.addScaledVector(_v.set(p.pos.x - b.pos.x, 0, p.pos.z - b.pos.z).normalize(), 12);
        }
      }
    } else if (this.slamCD <= 0 && dist < 10) {
      this.slamCD = 6;
      this.slamT = 1.0;
      fx.ring(_c.set(b.pos.x, b.pos.y + 0.15, b.pos.z), 0xffb02e, 10, 1.0);
      g.ui.toast('地面たたき！ ジャンプでかわせ');
    }
    if (this.summonCD <= 0) {
      this.summonCD = 15;
      for (const s of [-1, 1]) {
        const p = new THREE.Vector3(b.pos.x + s * 3, b.pos.y + 4, b.pos.z);
        this.mgr.spawn('drone', p, { hpMul: g.diff.hp });
      }
    }
    if (this.hp < this.maxHp * 0.5 && !this.enraged) {
      this.enraged = true;
      this.T = Object.assign({}, this.T, { fireCD: [1.5, 2.2], speed: 3.6 });
      g.ui.announce('WARDEN ENRAGED', '#ff2b4a');
    }
  }

  updateShooting(dt, tgt) {
    const g = this.mgr.game, T = this.T;
    if (this.stagger > 0) return;
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) { this.shootOnce(tgt); this.burst--; this.burstT = T.burstGap; }
      return;
    }
    this.fireT -= dt * g.diff.rate;
    if (this.fireT <= 0) {
      const dist = this.center(_c).distanceTo(tgt.chest);
      if (this.hasLOS && dist < 45) {
        this.burst = T.burst; this.burstT = 0.3;
        this.fireT = rand(T.fireCD[0], T.fireCD[1]);
        // 撃つ前に光って予告
        this.group.updateMatrixWorld(true);
        const mz = T.muzzles[this.mi % T.muzzles.length];
        _m.set(mz[0], mz[1], mz[2]); this.group.localToWorld(_m);
        g.effects.spawn(_m.x, _m.y, _m.z, 0, 0, 0, T.glow, T.fly ? 0.6 : 0.9, 0.3, 0, 0);
      } else this.fireT = 0.3;
    }
  }

  shootOnce(tgt) {
    const g = this.mgr.game, T = this.T;
    this.group.updateMatrixWorld(true);
    const mz = T.muzzles[this.mi++ % T.muzzles.length];
    _m.set(mz[0], mz[1], mz[2]); this.group.localToWorld(_m);
    const dist = _m.distanceTo(tgt.chest);
    const t = dist / T.shotSpeed;
    _a.copy(tgt.chest).addScaledVector(tgt.vel, t * 0.55);
    const inacc = T.inacc * g.diff.acc * (0.4 + dist / 25);
    _a.x += rand(-1, 1) * inacc; _a.y += rand(-0.6, 0.6) * inacc; _a.z += rand(-1, 1) * inacc;
    _v.subVectors(_a, _m).normalize();
    this.mgr.fireShot(_m, _v, T.shotSpeed, T.dmg * g.diff.dmg, T.shot, T.splash || 0);
    g.effects.spawn(_m.x, _m.y, _m.z, 0, 0, 0, T.glow, 0.7, 0.08, 0, 0);
    const vol = Math.max(0.1, 1 - g.camera.position.distanceTo(_m) / 50);
    g.audio.play(this.type === 'brute' ? 'bruteShot' : 'enemyShot', vol);
  }

  // スキャン中は壁越しに見える目印を頭上に出す
  updateMarker() {
    const on = this.mgr.scanT > 0;
    if (on && !this.marker) {
      this.marker = new THREE.Sprite(this.mgr.markerMat());
      this.marker.renderOrder = 20;
      this.group.add(this.marker);
    }
    if (this.marker) {
      this.marker.visible = on;
      this.marker.position.set(0, this.T.h + 0.5, 0);
      const s = this.type === 'brute' ? 0.055 : 0.04;
      this.marker.scale.set(s, s, s);
    }
  }

  dispose() { this.armorMat.dispose(); }
}

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.shots = [];
    this.typeMats = {};
    this.shotGeo = new THREE.SphereGeometry(1, 12, 8);
    const basic = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
    this.shotMats = { red: basic(0xff3344, 4), pink: basic(0xff4ae0, 4), orange: basic(0xff8a1e, 4) };
    this.shotColors = { red: 0xff3344, pink: 0xff4ae0, orange: 0xff8a1e };
    this.scanT = 0;
  }

  mats(type) {
    if (this.typeMats[type]) return this.typeMats[type];
    const T = TYPES[type];
    return (this.typeMats[type] = {
      armor: new THREE.MeshStandardMaterial({ color: T.armor, metalness: 0.55, roughness: 0.55, emissive: 0x000000 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x17191f, metalness: 0.6, roughness: 0.45 }),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(T.glow).multiplyScalar(3) }),
    });
  }

  markerMat() {
    if (this._markerMat) return this._markerMat;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = '#ff3ad8'; g.lineWidth = 7; g.shadowColor = '#ff3ad8'; g.shadowBlur = 10;
    g.beginPath(); g.moveTo(32, 6); g.lineTo(58, 32); g.lineTo(32, 58); g.lineTo(6, 32); g.closePath(); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 6, 0, Math.PI * 2); g.fill();
    this._markerMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false });
    return this._markerMat;
  }

  scan(t) {
    const g = this.game;
    this.scanT = t;
    g.audio.play('pad', 0.7);
    g.effects.ring(new THREE.Vector3(g.player.pos.x, g.player.pos.y + 0.2, g.player.pos.z), 0xff3ad8, 40, 0.9);
    g.ui.flash('rgba(255,58,216,0.18)');
    g.emit('scan');
  }

  spawn(type, pos, opts = {}) {
    const e = new Enemy(this, type, pos, opts);
    this.list.push(e);
    this.game.scene.add(e.group);
    if (opts.instant) { e.state = 'active'; e.group.visible = true; }
    else {
      this.game.effects.tracer(new THREE.Vector3(pos.x, pos.y, pos.z), new THREE.Vector3(pos.x, pos.y + 14, pos.z), TYPES[type].glow, 0.35, 0.9);
      this.game.audio.play('spawn', Math.max(0.1, 1 - this.game.camera.position.distanceTo(pos) / 60));
    }
    if (this.game.echo.active) e.preferEcho = Math.random() < 0.7;
    return e;
  }

  clear() {
    for (const e of this.list) { this.game.scene.remove(e.group); e.dispose(); }
    for (const s of this.shots) this.game.scene.remove(s.mesh);
    this.list = []; this.shots = []; this.scanT = 0;
  }

  aliveCount() { let n = 0; for (const e of this.list) if (e.alive) n++; return n; }

  update(dt) {
    if (this.scanT > 0) this.scanT -= dt;
    for (const e of this.list) if (e.alive) e.update(dt);
    if (this.list.some((e) => !e.alive)) this.list = this.list.filter((e) => e.alive);
    this.updateShots(dt);
  }

  // レイと敵の当たり球の交差。近い順
  raycast(o, d, maxD, inflate = 0) {
    const hits = [];
    for (const e of this.list) {
      if (!e.isActive()) continue;
      let best = Infinity, part = 'body';
      const p = e.body.pos;
      for (const hb of e.T.hitboxes) {
        const cx = p.x - o.x, cy = p.y + hb.y - o.y, cz = p.z - o.z;
        const t = cx * d.x + cy * d.y + cz * d.z;
        const r = hb.r + inflate;
        const d2 = cx * cx + cy * cy + cz * cz - t * t;
        if (d2 > r * r) continue;
        const th = t - Math.sqrt(r * r - d2);
        if (th < 0 && t < 0) continue;
        const tt = Math.max(0, th);
        if (tt < best) { best = tt; part = hb.part; }
      }
      if (best < maxD) hits.push({ enemy: e, dist: best, part, point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best) });
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits;
  }

  fireShot(from, dir, speed, dmg, kind, splash) {
    const mesh = new THREE.Mesh(this.shotGeo, this.shotMats[kind]);
    const r = kind === 'orange' ? 0.3 : kind === 'pink' ? 0.16 : 0.14;
    mesh.scale.setScalar(r);
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    this.shots.push({ pos: from.clone(), vel: dir.clone().multiplyScalar(speed), dmg, kind, r, splash, life: 4, mesh });
  }

  clearShotsNear(p, R) {
    let n = 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (s.pos.distanceTo(p) < R) {
        this.game.effects.sparks(s.pos, null, this.shotColors[s.kind], 6, 5);
        this.game.scene.remove(s.mesh); this.shots.splice(i, 1); n++;
      }
    }
    return n;
  }

  impact(s, point) {
    const g = this.game;
    if (s.splash) {
      g.effects.explosion(point, s.splash, 0xff8a1e, 0.6);
      const p = g.player;
      const d = p.chest.distanceTo(point);
      if (d < s.splash && p.alive) {
        const f = 1 - d / s.splash;
        p.takeDamage(s.dmg * (0.4 + 0.6 * f), point);
        p.body.vel.addScaledVector(_v.subVectors(p.chest, point).normalize(), 10 * f);
      }
      g.audio.play('explosion', Math.max(0.1, 0.7 - g.camera.position.distanceTo(point) / 60));
    } else {
      g.effects.sparks(point, null, this.shotColors[s.kind], 6, 5);
    }
  }

  updateShots(dt) {
    const g = this.game, p = g.player, fx = g.effects, echo = g.echo;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      let dead = s.life <= 0;
      for (let k = 0; k < 2 && !dead; k++) {
        const sdt = dt / 2;
        const sp = s.vel.length(), step = sp * sdt;
        _v.copy(s.vel).divideScalar(sp);
        const w = g.world.raycast(s.pos, _v, step);
        if (w) { this.impact(s, w.point); dead = true; break; }
        _a.copy(s.pos);
        s.pos.addScaledVector(s.vel, sdt);
        if (g.combat.shields.length && g.combat.shieldBlocks(_a, s.pos)) {
          fx.sparks(s.pos, null, 0xffb02e, 8, 5);
          dead = true; break;
        }
        if (p.alive) {
          const b = p.body;
          const cy = clamp(s.pos.y, b.pos.y + 0.3, b.pos.y + b.h - 0.2);
          const d = Math.hypot(s.pos.x - b.pos.x, s.pos.y - cy, s.pos.z - b.pos.z);
          if (d < 0.42 + s.r) {
            if (s.splash) this.impact(s, s.pos);
            else { p.takeDamage(s.dmg, s.pos); fx.sparks(s.pos, null, this.shotColors[s.kind], 5, 4); }
            dead = true; break;
          }
        }
        if (echo.active && s.pos.distanceTo(echo.chest) < 0.9) {
          fx.sparks(s.pos, null, 0x8c7bff, 8, 5);
          dead = true; break;
        }
      }
      if (dead) { g.scene.remove(s.mesh); this.shots.splice(i, 1); continue; }
      s.mesh.position.copy(s.pos);
      fx.spawn(s.pos.x, s.pos.y, s.pos.z, 0, 0, 0, this.shotColors[s.kind], s.r * 2.2, 0.18, 0, 0);
    }
  }

  kill(e, owner, head) {
    if (!e.alive) return;
    const g = this.game;
    e.alive = false;
    const c = e.center(new THREE.Vector3());
    g.scene.remove(e.group);
    e.dispose();
    g.effects.explosion(c, e.T.explR, e.T.glow, e.type === 'brute' ? 1.3 : 0.7);
    g.effects.debrisBurst(c, e.T.armor, e.type === 'brute' ? 10 : 5);
    g.audio.play('explosion', Math.max(0.15, 0.8 - g.camera.position.distanceTo(c) / 60));
    if (Math.random() < e.T.drop) {
      g.combat.spawnOrb(c);
      if (e.type === 'brute') g.combat.spawnOrb(c);
    }
    if (e.T.melee && owner !== 'world') {
      g.combat.explode(c.clone(), 4, 60, owner === 'echo' ? 'echo' : 'player', 0xff3030, { noSelf: true });
    } else if (e.T.melee) {
      g.effects.explosion(c, 3.8, 0xff3030, 0.9);
    }
    if (e.T.boss) { g.slowmo(1.4); g.shake(1); }
    if (owner !== 'world') g.onEnemyKilled(e, owner, head);
  }
}
