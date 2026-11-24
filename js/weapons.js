// 武器：5種類の定義、手元の銃モデル（ビューモデル）、射撃・リロード・切替
import * as THREE from 'three';
import { clamp, damp, rand, lerp } from './utils.js';

export const WEAPONS = [
  { id: 'rifle', name: 'VX-9 パルスライフル', short: 'RIFLE', type: 'hitscan', auto: true, rpm: 620, dmg: 19, headMul: 1.9, mag: 32, reload: 1.5,
    spread: 0.016, adsSpread: 0.002, recoil: 0.011, pellets: 1, range: 220, color: 0x3ee8ff, adsFov: 56, tracer: 0.018, sound: 'rifle', shake: 0.05 },
  { id: 'shotgun', name: 'HX スキャッター', short: 'SHOTGUN', type: 'hitscan', auto: false, rpm: 80, dmg: 11, headMul: 1.4, mag: 6, reload: 1.9,
    spread: 0.075, adsSpread: 0.05, recoil: 0.05, pellets: 11, range: 60, falloff: [12, 40], color: 0xff8a2a, adsFov: 68, tracer: 0.014, sound: 'shotgun', shake: 0.25, selfPush: 5 },
  { id: 'rail', name: 'LANCE レールガン', short: 'RAIL', type: 'rail', auto: false, rpm: 52, dmg: 115, headMul: 2.0, mag: 5, reload: 2.2,
    spread: 0.02, adsSpread: 0, recoil: 0.06, range: 300, color: 0xff3ad8, adsFov: 30, sound: 'rail', shake: 0.3 },
  { id: 'nova', name: 'NOVA ランチャー', short: 'NOVA', type: 'projectile', auto: false, rpm: 75, dmg: 105, radius: 5.5, speed: 48, mag: 4, reload: 2.0,
    spread: 0.005, adsSpread: 0, recoil: 0.045, range: 200, color: 0xb6ff3a, adsFov: 64, sound: 'launcher', shake: 0.2 },
  { id: 'arc', name: 'CHAIN アーク', short: 'ARC', type: 'arc', auto: true, rpm: 760, dmg: 8.5, mag: 70, reload: 1.8,
    spread: 0, adsSpread: 0, recoil: 0.002, range: 30, cone: 0.16, chains: 2, chainRange: 9, color: 0x8c7bff, adsFov: 68, sound: 'arc', shake: 0.02 },
];

let flashTex = null;
function getFlashTex() {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 6;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); g.stroke(); }
  flashTex = new THREE.CanvasTexture(c);
  return flashTex;
}

function buildModel(def) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x3c424f, metalness: 0.85, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171d, metalness: 0.6, roughness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: def.color, emissiveIntensity: 3.2 });
  const g = new THREE.Group();
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const cyl = (r, len, m, x, y, z, seg = 14) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); g.add(o); return o; };
  const torus = (r, t, m, z, y = 0) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 28), m); o.position.set(0, y, z); g.add(o); return o; };
  const muzzle = new THREE.Object3D();
  let spin = null;
  switch (def.id) {
    case 'rifle':
      box(0.07, 0.09, 0.42, metal, 0, 0, -0.12);
      box(0.075, 0.03, 0.3, dark, 0, 0.06, -0.1);
      box(0.05, 0.05, 0.07, dark, 0, 0.095, -0.04);
      box(0.03, 0.03, 0.012, accent, 0, 0.1, -0.08);
      cyl(0.018, 0.32, dark, 0, 0.005, -0.48);
      cyl(0.032, 0.13, metal, 0, 0.005, -0.38);
      for (let i = 0; i < 3; i++) cyl(0.036, 0.012, accent, 0, 0.005, -0.34 - i * 0.04);
      box(0.045, 0.16, 0.08, dark, 0, -0.11, -0.08).rotation.x = 0.18;
      box(0.04, 0.12, 0.05, dark, 0, -0.09, 0.06).rotation.x = -0.3;
      box(0.055, 0.07, 0.18, metal, 0, -0.01, 0.17);
      box(0.073, 0.012, 0.3, accent, 0, -0.02, -0.12);
      muzzle.position.set(0, 0.005, -0.66);
      break;
    case 'shotgun':
      box(0.09, 0.1, 0.38, metal, 0, 0, -0.1);
      cyl(0.024, 0.44, dark, -0.022, 0.02, -0.45);
      cyl(0.024, 0.44, dark, 0.022, 0.02, -0.45);
      box(0.1, 0.07, 0.16, dark, 0, -0.04, -0.4);
      box(0.092, 0.015, 0.36, accent, 0, 0.035, -0.1);
      torus(0.055, 0.008, accent, -0.62, 0.02);
      box(0.045, 0.12, 0.05, dark, 0, -0.1, 0.05).rotation.x = -0.3;
      box(0.065, 0.08, 0.2, metal, 0, -0.01, 0.18);
      box(0.02, 0.05, 0.1, accent, 0.05, 0, 0.02);
      muzzle.position.set(0, 0.02, -0.68);
      break;
    case 'rail':
      box(0.08, 0.1, 0.5, metal, 0, 0, -0.1);
      box(0.02, 0.035, 0.6, dark, -0.035, 0, -0.6);
      box(0.02, 0.035, 0.6, dark, 0.035, 0, -0.6);
      box(0.012, 0.012, 0.6, accent, 0, 0, -0.6);
      for (let i = 0; i < 5; i++) torus(0.05, 0.007, accent, -0.38 - i * 0.1);
      cyl(0.026, 0.18, dark, 0, 0.085, -0.08);
      box(0.03, 0.03, 0.01, accent, 0, 0.085, 0.015);
      box(0.045, 0.12, 0.05, dark, 0, -0.1, 0.05).rotation.x = -0.3;
      box(0.06, 0.09, 0.2, metal, 0, 0, 0.22);
      box(0.082, 0.014, 0.4, accent, 0, -0.03, -0.1);
      muzzle.position.set(0, 0, -0.92);
      break;
    case 'nova':
      cyl(0.066, 0.56, metal, 0, 0.02, -0.22, 18);
      cyl(0.078, 0.05, accent, 0, 0.02, -0.5, 18);
      cyl(0.072, 0.05, dark, 0, 0.02, 0.06, 18);
      box(0.04, 0.12, 0.06, dark, 0, -0.09, -0.05).rotation.x = -0.25;
      box(0.03, 0.08, 0.05, dark, 0, -0.07, -0.3);
      box(0.022, 0.04, 0.26, accent, 0, 0.095, -0.2);
      box(0.06, 0.05, 0.08, metal, 0, 0.1, -0.02);
      muzzle.position.set(0, 0.02, -0.53);
      break;
    case 'arc': {
      box(0.09, 0.11, 0.3, metal, 0, 0, -0.08);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), accent); core.position.set(0, 0, -0.27); g.add(core);
      spin = new THREE.Group(); spin.position.set(0, 0, -0.3); g.add(spin);
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.16), accent);
        p.position.set(Math.cos(a) * 0.055, Math.sin(a) * 0.055, -0.04); spin.add(p);
      }
      torus(0.065, 0.009, accent, -0.22);
      cyl(0.03, 0.18, dark, 0.06, -0.03, -0.05);
      box(0.045, 0.12, 0.05, dark, 0, -0.1, 0.04).rotation.x = -0.3;
      box(0.092, 0.014, 0.26, accent, 0, 0.04, -0.06);
      muzzle.position.set(0, 0, -0.42);
      break;
    }
  }
  g.add(muzzle);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: getFlashTex(), color: new THREE.Color(def.color).multiplyScalar(2.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.scale.setScalar(0.25); flash.visible = false;
  muzzle.add(flash);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; } });
  g.visible = false;
  return { group: g, muzzle, flash, spin };
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _p = new THREE.Vector3();

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.defs = WEAPONS;
    this.root = new THREE.Group();
    game.camera.add(this.root);
    this.models = WEAPONS.map((d) => { const m = buildModel(d); this.root.add(m.group); return m; });
    this.hip = new THREE.Vector3(0.2, -0.2, -0.36);
    this.adsPos = new THREE.Vector3(0, -0.098, -0.3);
    this.reset();
  }

  get def() { return this.defs[this.cur]; }
  get st() { return this.state[this.cur]; }

  reset() {
    this.state = WEAPONS.map((d) => ({ ammo: d.mag }));
    this.cur = 0; this.switchTo = -1;
    this.cooldown = 0; this.reloadT = 0; this.switchT = 0;
    this.adsT = 0; this.kick = 0; this.swayX = 0; this.swayY = 0; this.bobPhase = 0; this.flashT = 0; this.tilt = 0;
    this.spreadNow = 0.016;
    this.models.forEach((m, i) => { m.group.visible = i === 0; m.flash.visible = false; });
  }

  select(i) {
    if (i < 0 || i >= this.defs.length) return;
    if (i === this.cur && this.switchT <= 0) return;
    if (i === this.switchTo) return;
    this.switchTo = i; this.switchT = 0.32; this.reloadT = 0;
    this.game.audio.play('switch');
  }

  startReload() {
    if (this.reloadT > 0 || this.switchT > 0 || this.st.ammo >= this.def.mag) return;
    this.reloadT = this.def.reload;
    this.game.audio.play('reload');
  }

  update(dt, input, player) {
    const n = this.defs.length;
    this.cooldown -= dt;
    for (let i = 0; i < n; i++) if (input.pressed('w' + (i + 1))) this.select(i);
    const base = this.switchTo >= 0 ? this.switchTo : this.cur;
    if (input.pressed('next') || input.wheel > 0) this.select((base + 1) % n);
    if (input.wheel < 0) this.select((base + n - 1) % n);

    if (this.switchT > 0) {
      this.switchT -= dt;
      if (this.switchT <= 0.16 && this.switchTo >= 0) {
        this.models[this.cur].group.visible = false;
        this.models[this.cur].flash.visible = false;
        this.cur = this.switchTo; this.switchTo = -1;
        this.models[this.cur].group.visible = true;
      }
      if (this.switchT < 0) this.switchT = 0;
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloadT = 0; this.st.ammo = this.def.mag; }
    }
    if (input.pressed('reload')) this.startReload();

    const def = this.def, st = this.st;
    const wantAds = input.adsActive() && player.alive && this.reloadT <= 0 && this.switchT <= 0;
    this.adsT = damp(this.adsT, wantAds ? 1 : 0, 16, dt);

    const b = player.body;
    const hs = Math.hypot(b.vel.x, b.vel.z);
    this.spreadNow = lerp(def.spread, def.adsSpread, this.adsT) * (1 + Math.min(hs, 14) / 22) * (b.onGround ? 1 : 1.4);

    const trigger = def.auto ? input.isDown('fire') : input.pressed('fire');
    if (trigger && player.alive && this.switchT <= 0 && this.reloadT <= 0 && this.cooldown <= 0) {
      if (st.ammo > 0) this.fire(player);
      else { if (input.pressed('fire')) this.game.audio.play('empty'); this.startReload(); }
    }
    if (st.ammo === 0 && this.reloadT <= 0 && this.switchT <= 0 && this.cooldown <= 0) this.startReload();
    this.animate(dt, input, player, hs);
  }

  fire(player) {
    const g = this.game, def = this.def;
    this.st.ammo--;
    this.cooldown = Math.max(this.cooldown, 0) + 60 / def.rpm;
    const cam = g.camera;
    cam.getWorldPosition(_o); cam.getWorldDirection(_d);
    const model = this.models[this.cur];
    this.root.updateMatrixWorld(true);
    model.muzzle.getWorldPosition(_m);
    // ADS中は銃口を視線の少し下に寄せて、弾道を見やすくする
    if (this.adsT > 0.5) { _p.copy(_o).addScaledVector(_d, 0.8); _p.y -= 0.05; _m.lerp(_p, 0.5); }
    const hit = g.combat.fireShot(def, _o, _d, _m, 'player', { spread: this.spreadNow });
    g.stats.shots++;
    if (hit) g.stats.hits++;
    g.echo.addShot(this.cur, _d);
    const r = def.recoil * (1 - 0.5 * this.adsT);
    player.pitch += r * 0.5; player.recoil += r * 0.6;
    player.yaw += rand(-1, 1) * r * 0.3;
    this.kick = Math.min(this.kick + def.recoil * 9 + 0.15, 1.3);
    model.flash.visible = true;
    model.flash.scale.setScalar(rand(0.18, 0.32) * (def.id === 'shotgun' || def.id === 'nova' ? 1.6 : 1));
    model.flash.material.rotation = Math.random() * Math.PI;
    this.flashT = 0.045;
    g.effects.flash(_m, def.color, 3, 0.05);
    g.audio.play(def.sound);
    g.shake(def.shake);
    if (def.selfPush && !player.body.onGround) player.body.vel.addScaledVector(_d, -def.selfPush);
    g.emit('fire', { weapon: this.cur });
  }

  animate(dt, input, player, hs) {
    const b = player.body, def = this.def;
    this.swayX = damp(this.swayX, clamp(-input.lookDX * 0.0004, -0.05, 0.05), 8, dt);
    this.swayY = damp(this.swayY, clamp(input.lookDY * 0.0004, -0.05, 0.05), 8, dt);
    if (b.onGround && !player.sliding) this.bobPhase += dt * hs * 0.95;
    const bobA = clamp(hs / 10, 0, 1.3) * (b.onGround && !player.sliding ? 1 : 0.1) * (1 - this.adsT * 0.9);
    const bx = Math.sin(this.bobPhase) * 0.014 * bobA;
    const by = -Math.abs(Math.cos(this.bobPhase)) * 0.016 * bobA;
    this.kick = damp(this.kick, 0, 11, dt);
    const p = _p.copy(this.hip).lerp(this.adsPos, this.adsT);
    const idle = Math.sin(this.game.time * 1.7) * 0.003 * (1 - this.adsT);
    p.x += this.swayX * (1 - this.adsT * 0.7) + bx;
    p.y += this.swayY * (1 - this.adsT * 0.7) + by + idle + clamp(-b.vel.y * 0.0025, -0.035, 0.035);
    p.z += this.kick * 0.07;
    let rx = this.kick * 0.12, rz = bx * 3;
    this.tilt = damp(this.tilt, player.sliding ? 0.4 : player.dashT > 0 ? -player.strafe * 0.2 : 0, 10, dt);
    rz += this.tilt * (1 - this.adsT);
    if (this.switchT > 0) { const s = Math.sin((this.switchT / 0.32) * Math.PI); p.y -= s * 0.35; rx -= s * 0.7; }
    if (this.reloadT > 0) {
      const k = Math.sin((1 - this.reloadT / def.reload) * Math.PI);
      p.y -= k * 0.12; rx += k * 0.45; rz += k * 0.5;
    }
    this.root.position.copy(p);
    this.root.rotation.set(rx, this.swayX * 1.5, rz);
    const m = this.models[this.cur];
    if (m.spin) m.spin.rotation.z += dt * (this.game.input.isDown('fire') ? 18 : 2);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) m.flash.visible = false; }
  }
}
