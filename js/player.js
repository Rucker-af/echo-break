// プレイヤー：移動（ダッシュ・スライド・二段ジャンプ・フック）とカメラ
import * as THREE from 'three';
import { clamp, damp } from './utils.js';

export const GRAV = 26;
const SPEED = 10.5, ACCEL = 12, AIR_ACCEL = 2.8, FRICTION = 7;
const JUMP = 9.6, DJUMP = 9.2;
const DASH_SPEED = 28, DASH_TIME = 0.16, DASH_CHARGE = 2.0;
export const GRAPPLE_CD = 4.5, SHOCK_CD = 7;

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3(), _wd = new THREE.Vector3();
const _t = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.38, h: 1.8, onGround: false, wasGrounded: false, canStep: true, hitWall: false };
    this.chest = new THREE.Vector3();
    this.grapple = { active: false, anchor: new THREE.Vector3(), time: 0 };
    const ropeGeo = new THREE.BoxGeometry(1, 1, 1); ropeGeo.translate(0, 0, 0.5);
    this.rope = new THREE.Mesh(ropeGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3ee8ff).multiplyScalar(3) }));
    this.rope.visible = false; this.rope.frustumCulled = false;
    game.scene.add(this.rope);
    this.reset(new THREE.Vector3(0, 5, 0), 0);
  }

  get pos() { return this.body.pos; }
  get vel() { return this.body.vel; }

  reset(pos, yaw) {
    const b = this.body;
    b.pos.copy(pos); b.vel.set(0, 0, 0); b.h = 1.8; b.onGround = false;
    this.yaw = yaw; this.pitch = 0; this.recoil = 0; this.roll = 0;
    this.health = 100; this.maxHealth = 100; this.alive = true; this.lastDamage = -99;
    this.jumpsLeft = 1; this.coyote = 0; this.jumpBuffer = 0; this.slideBuffer = 0; this.airT = 0;
    this.dashCharges = 2; this.dashRecharge = 0; this.dashT = 0;
    this.sliding = false; this.slideT = 0;
    this.grapple.active = false; this.grappleCD = 0; this.shockCD = 0;
    this.echoMeter = 0;
    this.eye = 1.62; this.landDip = 0; this.fovKick = 0; this.strafe = 0;
    this.lookAccum = 0; this.moveAccum = 0;
    this.rope.visible = false;
    this.chest.set(pos.x, pos.y + 1.2, pos.z);
  }

  accel(dir, wishSpeed, acc, dt) {
    const v = this.body.vel;
    const cur = v.x * dir.x + v.z * dir.z;
    const add = wishSpeed - cur;
    if (add <= 0) return;
    const as = Math.min(acc * dt * wishSpeed, add);
    v.x += as * dir.x; v.z += as * dir.z;
  }

  friction(fr, dt) {
    const v = this.body.vel;
    const sp = Math.hypot(v.x, v.z);
    if (sp < 0.05) { v.x = v.z = 0; return; }
    const drop = Math.max(sp, 3) * fr * dt;
    const ns = Math.max(sp - drop, 0) / sp;
    v.x *= ns; v.z *= ns;
  }

  endSlide() {
    const b = this.body;
    if (this.game.world.free(b.pos.x, b.pos.y, b.pos.z, b.r, 1.8)) { this.sliding = false; b.h = 1.8; }
    else this.slideT = 0.1;
  }

  releaseGrapple() { this.grapple.active = false; this.rope.visible = false; }

  toggleGrapple() {
    const g = this.game;
    if (this.grapple.active) { this.releaseGrapple(); return; }
    if (this.grappleCD > 0) { g.audio.play('empty'); return; }
    const cam = g.camera;
    cam.getWorldPosition(_o); cam.getWorldDirection(_d);
    const hit = g.world.raycast(_o, _d, 60);
    if (!hit || hit.dist < 2.5) { g.audio.play('empty'); g.ui.toast('フックが届かない'); return; }
    this.grapple.active = true;
    this.grapple.anchor.copy(hit.point).addScaledVector(hit.normal, 0.5);
    this.grapple.time = 0;
    this.grappleCD = GRAPPLE_CD;
    this.jumpsLeft = 1;
    if (this.sliding) this.endSlide();
    this.body.vel.y = Math.max(this.body.vel.y, 3);
    g.audio.play('grapple');
    g.effects.sparks(hit.point, hit.normal, 0x3ee8ff, 16, 6);
    g.effects.flash(hit.point, 0x3ee8ff, 6, 0.2);
    g.emit('grapple');
  }

  update(dt, input) {
    const g = this.game, b = this.body;
    if (!this.alive) {
      b.vel.x *= 0.92; b.vel.z *= 0.92; b.vel.y -= GRAV * dt;
      b.wasGrounded = b.onGround;
      g.world.moveBody(b, dt);
      this.releaseGrapple();
      return;
    }
    // 視点
    const fovScale = g.camera.fov / g.settings.fov;
    const sens = g.settings.sens * (input.isTouch ? 0.0045 : 0.0021) * fovScale;
    const dyaw = input.lookDX * sens, dp = input.lookDY * sens;
    this.yaw -= dyaw;
    this.pitch = clamp(this.pitch - dp, -1.52, 1.52);
    this.lookAccum += Math.abs(dyaw) + Math.abs(dp);

    // 入力方向
    const ax = input.axisX(), ay = input.axisY();
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    _f.set(-sy, 0, -cy); _r.set(cy, 0, -sy);
    _w.set(0, 0, 0).addScaledVector(_f, ay).addScaledVector(_r, ax);
    let wl = _w.length();
    if (wl > 1) { _w.divideScalar(wl); wl = 1; }
    if (wl > 0.001) _wd.copy(_w).divideScalar(wl); else _wd.set(0, 0, 0);
    const wishSpeed = SPEED * wl;
    this.strafe = ax;

    // タイマー
    if (b.onGround) { this.coyote = 0.12; this.jumpsLeft = 1; this.airT = 0; } else { this.coyote -= dt; this.airT += dt; }
    this.jumpBuffer = input.pressed('jump') ? 0.13 : this.jumpBuffer - dt;
    this.slideBuffer = input.pressed('slide') ? 0.25 : this.slideBuffer - dt;
    this.grappleCD = Math.max(0, this.grappleCD - dt);
    this.shockCD = Math.max(0, this.shockCD - dt);
    if (this.dashCharges < 2) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= DASH_CHARGE) { this.dashCharges++; this.dashRecharge = 0; }
    }
    this.echoMeter = Math.min(100, this.echoMeter + dt * 1.3);

    // スキル
    if (input.pressed('grapple')) this.toggleGrapple();
    if (input.pressed('shock')) {
      if (this.shockCD <= 0) { this.shockCD = SHOCK_CD; g.combat.shockwave(); } else g.audio.play('empty');
    }
    if (input.pressed('echo')) {
      if (this.echoMeter >= 100 && !g.echo.active) { if (g.echo.activate()) this.echoMeter = 0; }
      else { g.audio.play('empty'); g.ui.toast(g.echo.active ? 'エコー再生中' : `ECHO チャージ中 ${Math.floor(this.echoMeter)}%`); }
    }

    // ジャンプ
    let jumped = false;
    if (this.jumpBuffer > 0) {
      if (this.grapple.active) {
        this.releaseGrapple(); b.vel.y = Math.max(b.vel.y, 0) + 7; jumped = true; this.jumpBuffer = 0;
        g.audio.play('jump');
      } else if (this.coyote > 0) {
        b.vel.y = JUMP; this.coyote = 0; jumped = true; this.jumpBuffer = 0;
        if (this.sliding) { this.sliding = false; b.h = 1.8; }
        g.audio.play('jump', 0.7); g.emit('jump');
      } else if (this.jumpsLeft > 0) {
        this.jumpsLeft--; b.vel.y = DJUMP; jumped = true; this.jumpBuffer = 0;
        if (wl > 0.1) {
          const hs = Math.max(Math.hypot(b.vel.x, b.vel.z), SPEED);
          b.vel.x = _wd.x * hs; b.vel.z = _wd.z * hs;
        }
        g.effects.ring(_t.set(b.pos.x, b.pos.y + 0.1, b.pos.z), 0x8be9ff, 1.8, 0.35);
        g.audio.play('doubleJump'); g.emit('doubleJump');
      }
    }

    // ダッシュ
    if (input.pressed('dash') && this.dashCharges > 0 && this.dashT <= 0) {
      const d = wl > 0.1 ? _wd : _f;
      b.vel.x = d.x * DASH_SPEED; b.vel.z = d.z * DASH_SPEED; b.vel.y = Math.max(b.vel.y * 0.2, 0.8);
      this.dashT = DASH_TIME; this.dashCharges--;
      if (this.dashCharges === 1) this.dashRecharge = 0;
      if (this.sliding) { this.sliding = false; b.h = 1.8; }
      this.releaseGrapple();
      this.fovKick = 11;
      g.audio.play('dash'); g.emit('dash'); g.ui.speedLines();
      for (let i = 0; i < 18; i++) {
        g.effects.spawn(b.pos.x + (Math.random() - 0.5), b.pos.y + Math.random() * 1.6, b.pos.z + (Math.random() - 0.5),
          -d.x * 6 + (Math.random() - 0.5) * 2, (Math.random() - 0.5), -d.z * 6 + (Math.random() - 0.5) * 2, 0x8be9ff, 0.12, 0.35, 0, 2);
      }
    }

    // スライディング
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (this.slideBuffer > 0 && b.onGround && !this.sliding && hs > 4.5 && this.dashT <= 0 && !jumped) {
      this.sliding = true; this.slideT = 0.85; this.slideBuffer = 0;
      const k = Math.min(hs + 5.5, 19.5) / hs;
      b.vel.x *= k; b.vel.z *= k; b.h = 1.0;
      g.audio.play('slide'); g.emit('slide');
    }
    if (this.sliding) {
      this.slideT -= dt;
      if (this.slideT <= 0 || hs < 3.5 || (!b.onGround && this.airT > 0.3)) this.endSlide();
      if (b.onGround && Math.random() < 0.6) {
        g.effects.spawn(b.pos.x + (Math.random() - 0.5) * 0.4, b.pos.y + 0.05, b.pos.z + (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0xffb02e, 0.07, 0.3, 12, 0);
      }
    }

    // 速度の更新
    if (this.dashT > 0) {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        const s = Math.hypot(b.vel.x, b.vel.z), cap = 15;
        if (s > cap) { b.vel.x *= cap / s; b.vel.z *= cap / s; }
      }
    } else if (this.grapple.active) {
      const gr = this.grapple; gr.time += dt;
      _t.set(b.pos.x, b.pos.y + 1.2, b.pos.z);
      _d.subVectors(gr.anchor, _t);
      const dist = _d.length(); _d.divideScalar(dist || 1);
      b.vel.addScaledVector(_d, 78 * dt);
      const along = b.vel.dot(_d);
      _t.copy(b.vel).addScaledVector(_d, -along).multiplyScalar(Math.max(0, 1 - 3 * dt));
      b.vel.copy(_d).multiplyScalar(along).add(_t);
      this.accel(_wd, 8, 3, dt);
      b.vel.y -= GRAV * 0.2 * dt;
      const sp = b.vel.length();
      if (sp > 34) b.vel.multiplyScalar(34 / sp);
      if (dist < 2.2 || gr.time > 1.8) { this.releaseGrapple(); b.vel.y += 4; }
    } else {
      if (b.onGround && !jumped) {
        if (this.sliding) { this.friction(0.9, dt); this.accel(_wd, wishSpeed * 0.3, 4, dt); }
        else { this.friction(FRICTION, dt); this.accel(_wd, wishSpeed, ACCEL, dt); }
      } else {
        this.accel(_wd, wishSpeed, AIR_ACCEL, dt);
      }
      b.vel.y -= GRAV * dt;
    }
    const hsp = Math.hypot(b.vel.x, b.vel.z);
    if (hsp > 40) { b.vel.x *= 40 / hsp; b.vel.z *= 40 / hsp; }

    const prevVy = b.vel.y, wasG = b.onGround;
    b.wasGrounded = b.onGround;
    g.world.moveBody(b, dt);
    if (b.onGround && !wasG && prevVy < -7) {
      this.landDip = Math.min(0.3, -prevVy * 0.018);
      g.audio.play('land', Math.min(1, -prevVy / 20));
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        g.effects.spawn(b.pos.x, b.pos.y + 0.05, b.pos.z, Math.cos(a) * 4, 0.5, Math.sin(a) * 4, 0x9fb4ff, 0.1, 0.3, 0, 4);
      }
    }

    // ジャンプパッド
    for (const p of g.world.pads) {
      const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z;
      if (dx * dx + dz * dz < p.r * p.r && b.pos.y < p.pos.y + 0.6 && b.vel.y <= 0.5) {
        b.vel.x = p.dir.x * p.push; b.vel.z = p.dir.z * p.push; b.vel.y = p.up;
        b.onGround = false; this.jumpsLeft = 1; this.coyote = 0;
        if (this.sliding) { this.sliding = false; b.h = 1.8; }
        this.fovKick = 8;
        g.audio.play('pad');
        g.effects.ring(_t.set(p.pos.x, 0.25, p.pos.z), 0x3ee8ff, 3, 0.5);
        g.effects.burst(_t.set(p.pos.x, 0.4, p.pos.z), 0x3ee8ff, 30, 6, 0.12, 0.6, -6);
        g.emit('pad');
      }
    }

    this.moveAccum += hsp * dt;
    if (b.pos.y < -30) { b.pos.set(0, 5.2, 0); b.vel.set(0, 0, 0); }
    if (g.time - this.lastDamage > 4.5 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 20 * dt);
    this.chest.set(b.pos.x, b.pos.y + b.h * 0.68, b.pos.z);
  }

  updateRope() {
    if (!this.grapple.active) { this.rope.visible = false; return; }
    const cam = this.game.camera;
    _o.set(0.18, -0.2, -0.35); cam.localToWorld(_o);
    const dist = _o.distanceTo(this.grapple.anchor);
    this.rope.visible = true;
    this.rope.position.copy(_o);
    this.rope.lookAt(this.grapple.anchor);
    this.rope.scale.set(0.025, 0.025, dist);
  }

  takeDamage(amount, from) {
    if (!this.alive) return;
    const g = this.game;
    if (g.mode === 'tutorial') amount *= 0.5;
    this.health -= amount;
    this.lastDamage = g.time;
    g.ui.damage(amount, from);
    g.shake(Math.min(0.45, amount / 45));
    g.audio.play('hurt', 0.8);
    if (this.health <= 0) {
      if (g.mode === 'tutorial') this.health = 1;
      else { this.health = 0; this.alive = false; g.onPlayerDeath(); }
    }
  }

  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }

  updateCamera(dt) {
    const g = this.game, b = this.body, cam = g.camera;
    const eyeT = !this.alive ? 0.35 : this.sliding ? 0.95 : 1.62;
    this.eye = damp(this.eye, eyeT, this.alive ? 14 : 3, dt);
    this.landDip = damp(this.landDip, 0, 8, dt);
    cam.position.set(b.pos.x, b.pos.y + this.eye - this.landDip, b.pos.z);
    const rollT = !this.alive ? 0.5 : -this.strafe * 0.022 + (this.sliding ? 0.07 : 0) + (this.dashT > 0 ? -this.strafe * 0.05 : 0);
    this.roll = damp(this.roll, rollT, this.alive ? 10 : 2, dt);
    this.recoil = damp(this.recoil, 0, 9, dt);
    cam.rotation.set(this.pitch + this.recoil, this.yaw, this.roll);
    this.fovKick = damp(this.fovKick, 0, 5, dt);
    const hs = Math.hypot(b.vel.x, b.vel.z);
    const base = g.settings.fov;
    const speedF = clamp((hs - SPEED) * 0.6, 0, 12);
    const w = g.weapons;
    const target = THREE.MathUtils.lerp(base + speedF + this.fovKick, w.def.adsFov * (base / 75), w.adsT);
    cam.fov = damp(cam.fov, target, 14, dt);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.updateRope();
  }
}
