// 戦闘：射撃の当たり判定、ロケット、爆発、ショックウェーブ、回復オーブ
import * as THREE from 'three';
import { rand } from './utils.js';

const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);
const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
    this.rockets = [];
    this.wells = [];
    this.orbs = [];
    this.shields = [];
    this.powerups = [];
    this.rocketGeo = new THREE.SphereGeometry(0.16, 12, 8);
    this.rocketMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb6ff3a).multiplyScalar(4) });
    this.orbGeo = new THREE.OctahedronGeometry(0.26, 1);
    this.orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3aff9a).multiplyScalar(3) });
  }

  clear() {
    for (const r of this.rockets) this.game.scene.remove(r.mesh);
    for (const o of this.orbs) this.game.scene.remove(o.mesh);
    for (const sh of this.shields) this.game.scene.remove(sh.mesh);
    for (const pu of this.powerups) this.game.scene.remove(pu.mesh);
    for (const w of this.wells || []) this.game.scene.remove(w.mesh);
    this.wells = [];
    this.rockets = []; this.orbs = []; this.shields = []; this.powerups = [];
  }

  spreadDir(dir, s, out) {
    out.copy(dir);
    if (!s) return out;
    _u.crossVectors(dir, Math.abs(dir.y) < 0.99 ? UP : RIGHT).normalize();
    _w.crossVectors(dir, _u);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s;
    return out.addScaledVector(_u, Math.cos(a) * r).addScaledVector(_w, Math.sin(a) * r).normalize();
  }

  trace(origin, dir, range) {
    const w = this.game.world.raycast(origin, dir, range);
    const maxD = w ? w.dist : range;
    const hits = this.game.enemies.raycast(origin, dir, maxD);
    return { w, maxD, hits };
  }

  // 1発ぶんの射撃。プレイヤーとエコーで共通。何かに当たったら true
  fireShot(def, origin, dir, muzzle, owner, opts = {}) {
    const g = this.game, fx = g.effects;
    const spread = opts.spread ?? def.spread;
    const agg = new Map();
    const mul = owner === 'player' ? g.player.dmgMul() : 1;
    const hitE = (e, dmg0, part, point, dv) => {
      const dmg = dmg0 * mul;
      const killed = e.damage(dmg, part, dv, owner);
      const a = agg.get(e) || { dmg: 0, head: false, point, killed: false };
      a.dmg += dmg; a.head = a.head || part === 'head'; a.killed = a.killed || killed; a.point = point;
      agg.set(e, a);
    };
    let any = false;
    const d = new THREE.Vector3();
    const muz = muzzle.clone();

    if (def.type === 'hitscan') {
      for (let i = 0; i < (def.pellets || 1); i++) {
        this.spreadDir(dir, spread, d);
        const { w, maxD, hits } = this.trace(origin, d, def.range);
        let end;
        if (hits.length) {
          const h = hits[0];
          let dmg = def.dmg * (h.part === 'head' ? def.headMul : 1);
          if (def.falloff) { const [a, b] = def.falloff; if (h.dist > a) dmg *= Math.max(0.3, 1 - (h.dist - a) / (b - a) * 0.7); }
          hitE(h.enemy, dmg, h.part, h.point, d);
          end = h.point; any = true;
          fx.sparks(h.point, _v.copy(d).negate(), 0xffc07a, 5, 7);
        } else if (w) {
          end = w.point;
          fx.sparks(w.point, w.normal, def.color, 4, 7);
          if (w.col && w.col.barrel) g.world.blowBarrel(w.col.barrel, owner);
        } else end = _e.copy(origin).addScaledVector(d, maxD).clone();
        fx.tracer(muz, end, def.color, def.tracer, 0.07);
      }
    } else if (def.type === 'rail') {
      this.spreadDir(dir, spread, d);
      const { w, maxD, hits } = this.trace(origin, d, def.range);
      const end = w ? w.point : origin.clone().addScaledVector(d, maxD);
      for (const h of hits) {
        hitE(h.enemy, def.dmg * (h.part === 'head' ? def.headMul : 1), h.part, h.point, d);
        fx.burst(h.point, def.color, 16, 8, 0.12, 0.4);
        any = true;
      }
      fx.tracer(muz, end, def.color, 0.08, 0.45);
      fx.tracer(muz, end, 0xffffff, 0.022, 0.25);
      const L = Math.min(muz.distanceTo(end), 90);
      _u.crossVectors(d, Math.abs(d.y) < 0.99 ? UP : RIGHT).normalize(); _w.crossVectors(d, _u);
      for (let i = 0; i < 60; i++) {
        const t = (i / 60) * L, a = t * 1.6;
        _c.copy(muz).addScaledVector(d, t);
        _v.copy(_u).multiplyScalar(Math.cos(a)).addScaledVector(_w, Math.sin(a));
        fx.spawn(_c.x + _v.x * 0.12, _c.y + _v.y * 0.12, _c.z + _v.z * 0.12, _v.x * 1.2, _v.y * 1.2, _v.z * 1.2, def.color, 0.09, 0.5 + Math.random() * 0.3, 0, 1);
      }
      if (w) { fx.sparks(w.point, w.normal, def.color, 22, 10); fx.flash(w.point, def.color, 10, 0.15); if (w.col && w.col.barrel) g.world.blowBarrel(w.col.barrel, owner); }
    } else if (def.type === 'projectile') {
      this.spreadDir(dir, spread, d);
      const w = g.world.raycast(origin, d, 150);
      const aim = origin.clone().addScaledVector(d, w ? w.dist : 150);
      const rd = aim.sub(muz);
      if (rd.length() < 1.5) rd.copy(d); else rd.normalize();
      this.spawnRocket(muz, rd.multiplyScalar(def.speed), def, owner);
    } else if (def.type === 'arc') {
      const cone = Math.cos(def.cone);
      let best = null, bestDot = cone;
      for (const e of g.enemies.list) {
        if (!e.isActive()) continue;
        e.center(_c);
        _v.subVectors(_c, origin);
        const dist = _v.length();
        if (dist > def.range) continue;
        const dot = _v.dot(dir) / dist;
        if (dot > bestDot && g.world.los(origin, _c)) { best = e; bestDot = dot; }
      }
      if (!best) {
        const w = g.world.raycast(origin, dir, 13);
        const end = w ? w.point : origin.clone().addScaledVector(dir, 13);
        fx.bolt(muz, end, def.color, 6, 0.6);
        if (w) fx.sparks(w.point, w.normal, def.color, 3, 5);
      } else {
        const hit = new Set([best]);
        let cur = best, from = muz, dmg = def.dmg;
        for (let k = 0; k <= def.chains && cur; k++) {
          const c = cur.center(new THREE.Vector3());
          fx.bolt(from, c, def.color, 7, 0.7);
          fx.spawn(c.x, c.y, c.z, 0, 0, 0, def.color, 0.8, 0.08, 0, 0);
          hitE(cur, dmg, 'body', c, _v.subVectors(c, from).normalize().clone());
          any = true;
          from = c; dmg *= 0.6;
          let next = null, nd = def.chainRange;
          for (const e of g.enemies.list) {
            if (!e.isActive() || hit.has(e)) continue;
            const dd = e.center(_c).distanceTo(c);
            if (dd < nd && g.world.los(c, _c)) { nd = dd; next = e; }
          }
          if (next) hit.add(next);
          cur = next;
        }
      }
    }
    for (const [e, a] of agg) g.onHitFeedback(e, a.dmg, a.head, a.point, owner, a.killed);
    return any;
  }

  spawnRocket(pos, vel, def, owner) {
    const mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    mesh.position.copy(pos);
    mesh.scale.set(1, 1, 2.2);
    mesh.lookAt(_v.copy(pos).add(vel));
    this.game.scene.add(mesh);
    this.rockets.push({ pos: pos.clone(), vel: vel.clone(), def, owner, life: 4, mesh });
  }

  // グラビティ砲：小さなブラックホール。周りの敵を吸い寄せてから爆発する
  spawnWell(pos, def, owner) {
    const g = this.game;
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), new THREE.MeshBasicMaterial({ color: 0x050008 }));
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(1.6), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 48), ringMat);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.03, 8, 48), ringMat);
    ring.rotation.x = Math.PI / 2; ring2.rotation.x = Math.PI / 2.6;
    mesh.add(core, ring, ring2);
    mesh.position.copy(pos);
    g.scene.add(mesh);
    this.wells.push({ pos, def, owner, t: def.pullTime, mesh, ring, ring2 });
    g.audio.play('grav');
    g.effects.ring(pos, def.color, def.pullR, def.pullTime);
  }

  updateWells(dt) {
    const g = this.game, fx = g.effects;
    for (let i = this.wells.length - 1; i >= 0; i--) {
      const w = this.wells[i];
      w.t -= dt;
      const k = 1 - w.t / w.def.pullTime;
      w.mesh.scale.setScalar(0.6 + k * 0.7);
      w.ring.rotation.z += dt * 8; w.ring2.rotation.z -= dt * 6;
      for (const e of g.enemies.list) {
        if (!e.isActive() || !e.T.knock) continue;
        e.center(_c);
        _v.subVectors(w.pos, _c);
        const d = _v.length();
        if (d > w.def.pullR || d < 0.3) continue;
        // 中心へ向かう速さを直接決める（近いほどゆっくり、中心で止まる）
        const want = Math.min(1, e.T.knock) * Math.min(14, d * 3.2);
        _v.divideScalar(d);
        e.body.vel.x += (_v.x * want - e.body.vel.x) * Math.min(1, 10 * dt);
        e.body.vel.z += (_v.z * want - e.body.vel.z) * Math.min(1, 10 * dt);
        if (e.T.fly) e.body.vel.y += (_v.y * want - e.body.vel.y) * Math.min(1, 10 * dt);
        e.pulledT = 0.2;
      }
      // 吸い込まれる光の粒
      for (let n = 0; n < 3; n++) {
        const a = Math.random() * Math.PI * 2, r = rand(2, w.def.pullR);
        const x = w.pos.x + Math.cos(a) * r, z = w.pos.z + Math.sin(a) * r, y = w.pos.y + rand(-1, 1.5);
        fx.spawn(x, y, z, (w.pos.x - x) * 2.2, (w.pos.y - y) * 2.2, (w.pos.z - z) * 2.2, w.def.color, 0.12, 0.45, 0, 1);
      }
      if (w.t <= 0) {
        g.scene.remove(w.mesh);
        this.wells.splice(i, 1);
        this.explode(w.pos.clone(), w.def.radius, w.def.dmg, w.owner, w.def.color);
      }
    }
  }

  explode(pos, radius, dmg, owner, color, opts = {}) {
    const g = this.game;
    const agg = new Map();
    let n = 0;
    for (const e of g.enemies.list) {
      if (!e.isActive()) continue;
      e.center(_c);
      const dist = _c.distanceTo(pos);
      const reach = radius + e.T.r * 0.6;
      if (dist >= reach) continue;
      const f = 1 - dist / reach;
      const dv = _v.subVectors(_c, pos).normalize().clone();
      const dm = dmg * (0.3 + 0.7 * f) * (owner === 'player' ? g.player.dmgMul() : 1);
      const killed = e.damage(dm, 'body', dv, owner);
      e.knock(dv, 14 * f);
      agg.set(e, { dmg: dm, point: _c.clone(), killed });
      n++;
    }
    const p = g.player;
    if (owner !== 'echo' && !opts.noSelf && p.alive) {
      const dist = p.chest.distanceTo(pos);
      const R = radius + 0.6;
      if (dist < R) {
        const f = 1 - dist / R;
        const dv = _v.subVectors(p.chest, pos).normalize();
        p.body.vel.addScaledVector(dv, 17 * f);
        p.body.vel.y += 5 * f;
        if (owner === 'player' && !opts.noSelf) { if (f > 0.2) p.takeDamage(12 * f, pos); }
      }
    }
    for (const [e, a] of agg) g.onHitFeedback(e, a.dmg, false, a.point, owner, a.killed);
    if (owner === 'player' && n > 0) g.stats.hits++;
    g.effects.explosion(pos, radius, color);
    if (g.world.blastBarrels) g.world.blastBarrels(pos, radius, owner);
    const dPl = g.camera.position.distanceTo(pos);
    g.audio.play('explosion', Math.max(0.15, 1 - dPl / 60));
    g.shake(Math.max(0, 0.6 - dPl / 40));
    return n;
  }

  shockwave(power = 1) {
    const g = this.game, p = g.player;
    const c = new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z);
    const R = 10 * Math.sqrt(power);
    let n = 0;
    const agg = new Map();
    for (const e of g.enemies.list) {
      if (!e.isActive()) continue;
      e.center(_c);
      const d = _c.distanceTo(c);
      if (d > R + e.T.r) continue;
      const f = Math.max(0, 1 - d / (R + e.T.r));
      const dv = _v.subVectors(_c, c).normalize().clone();
      const dm = 55 * power * (0.4 + 0.6 * f);
      const killed = e.damage(dm, 'body', dv, 'player');
      e.knock(dv, (22 * f + 6) * Math.min(power, 1.2));
      e.body.vel.y += 8 * f * e.T.knock;
      e.stagger = 1.2;
      agg.set(e, { dmg: dm, point: _c.clone(), killed });
      n++;
    }
    const cleared = g.enemies.clearShotsNear(c, R);
    for (const [e, a] of agg) g.onHitFeedback(e, a.dmg, false, a.point, 'player', a.killed);
    p.body.vel.y = Math.max(p.body.vel.y, p.body.onGround ? 4 : 7);
    const fx = g.effects;
    fx.ring(new THREE.Vector3(p.pos.x, p.pos.y + 0.15, p.pos.z), 0x3ee8ff, R, 0.55);
    fx.ring(new THREE.Vector3(p.pos.x, p.pos.y + 0.8, p.pos.z), 0xffffff, R * 0.7, 0.4);
    fx.shell(c, R * 0.9, 0x3ee8ff, 0.45, 0.35);
    fx.flash(c, 0x3ee8ff, 16, 0.3);
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2, s = 14 + Math.random() * 10;
      fx.spawn(c.x, p.pos.y + 0.3 + Math.random() * 1.5, c.z, Math.cos(a) * s, rand(-1, 2), Math.sin(a) * s, i % 4 ? 0x3ee8ff : 0xffffff, 0.14, 0.45, 0, 2.5);
    }
    g.audio.play('shock'); g.shake(0.45);
    g.ui.flash('rgba(62,232,255,0.25)');
    g.emit('shock', { count: n, cleared });
  }

  // BOULDER の必殺技：前方に敵の弾を止める盾
  spawnShield(player) {
    const g = this.game;
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    const n = new THREE.Vector3(-sy, 0, -cy);
    const pos = new THREE.Vector3(player.pos.x + n.x * 2.4, player.pos.y + 1.3, player.pos.z + n.z * 2.4);
    const W = 4.2, H = 2.8;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(player.char.color).multiplyScalar(1.6), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H, 6, 4), mat);
    const wire = new THREE.Mesh(new THREE.PlaneGeometry(W, H, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(player.char.color).multiplyScalar(2.5), wireframe: true, transparent: true, opacity: 0.5 }));
    mesh.add(plane, wire);
    mesh.position.copy(pos);
    mesh.rotation.y = player.yaw;
    g.scene.add(mesh);
    this.shields.push({ mesh, mat, wire, pos, n, W, H, t: 8, max: 8 });
    g.effects.burst(pos, player.char.color, 40, 6, 0.12, 0.5);
    g.audio.play('shock', 0.6);
  }

  // 敵の弾が盾に当たったか（移動前 a → 移動後 b）
  shieldBlocks(a, b) {
    for (const sh of this.shields) {
      const da = (a.x - sh.pos.x) * sh.n.x + (a.z - sh.pos.z) * sh.n.z;
      const db = (b.x - sh.pos.x) * sh.n.x + (b.z - sh.pos.z) * sh.n.z;
      if ((da > 0) === (db > 0) && Math.abs(db) > 0.25) continue;
      const rx = -sh.n.z, rz = sh.n.x;
      const lx = (b.x - sh.pos.x) * rx + (b.z - sh.pos.z) * rz;
      const ly = b.y - sh.pos.y;
      if (Math.abs(lx) < sh.W / 2 && Math.abs(ly) < sh.H / 2) {
        sh.hit = 0.15;
        return true;
      }
    }
    return false;
  }

  // ---- パワーアップ ----
  spawnPowerup() {
    const g = this.game;
    const spots = g.world.powerSpots && g.world.powerSpots.length ? g.world.powerSpots : [[0, 0, 20]];
    const free = spots.filter(([x, , z]) => !this.powerups.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 3));
    const [x, y, z] = free[Math.floor(Math.random() * free.length)];
    const kinds = [
      { id: 'dmg', name: 'ダメージ UP', color: 0xff3d5a },
      { id: 'haste', name: 'ヘイスト', color: 0x3aff9a },
      { id: 'charge', name: 'オーバーチャージ', color: 0xffd23a },
    ];
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    const grp = new THREE.Group();
    const col = new THREE.Color(k.color);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2) }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.04, 8, 40), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.5) }));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.2), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 3.2;
    grp.add(core, ring, beam);
    grp.position.set(x, y + 1.1, z);
    g.scene.add(grp);
    this.powerups.push({ kind: k, pos: new THREE.Vector3(x, y, z), mesh: grp, core, ring, t: 0, life: 40 });
    g.ui.toast(`パワーアップ出現：${k.name}`);
    g.effects.burst(grp.position, k.color, 30, 5, 0.15, 0.6);
  }

  updatePowerups(dt) {
    const g = this.game, p = g.player;
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      pu.t += dt; pu.life -= dt;
      pu.core.rotation.set(pu.t * 1.3, pu.t * 2, 0);
      pu.ring.rotation.set(Math.PI / 2 + Math.sin(pu.t) * 0.3, pu.t, 0);
      pu.mesh.position.y = pu.pos.y + 1.1 + Math.sin(pu.t * 2.5) * 0.18;
      const d = Math.hypot(p.pos.x - pu.pos.x, p.pos.z - pu.pos.z);
      if (p.alive && d < 1.7 && Math.abs(p.pos.y - pu.pos.y) < 2.2) {
        const k = pu.kind;
        if (k.id === 'dmg') p.buffs.dmg = 12;
        else if (k.id === 'haste') p.buffs.haste = 12;
        else { p.echoMeter = Math.min(100, p.echoMeter + 50); p.ultMeter = Math.min(100, p.ultMeter + 50); }
        g.audio.play('pickup'); g.audio.play('ok');
        g.effects.burst(pu.mesh.position, k.color, 50, 7, 0.16, 0.6);
        g.ui.announce(k.name, '#' + k.color.toString(16).padStart(6, '0'));
        g.ui.flash(`rgba(${(k.color >> 16) & 255},${(k.color >> 8) & 255},${k.color & 255},0.25)`);
        g.scene.remove(pu.mesh); this.powerups.splice(i, 1);
        g.emit('powerup', { id: k.id });
        continue;
      }
      if (pu.life <= 0) { g.scene.remove(pu.mesh); this.powerups.splice(i, 1); }
    }
  }

  spawnOrb(pos) {
    const mesh = new THREE.Mesh(this.orbGeo, this.orbMat);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.orbs.push({ mesh, pos: pos.clone(), vel: new THREE.Vector3(rand(-3, 3), rand(5, 8), rand(-3, 3)), life: 15, t: Math.random() * 6 });
  }

  update(dt) {
    const g = this.game, fx = g.effects;
    this.updatePowerups(dt);
    for (let i = this.shields.length - 1; i >= 0; i--) {
      const sh = this.shields[i];
      sh.t -= dt; sh.hit = Math.max(0, (sh.hit || 0) - dt);
      const k = sh.t / sh.max;
      sh.mat.opacity = 0.18 + sh.hit * 2 + (k < 0.2 ? Math.sin(g.time * 30) * 0.1 : 0);
      sh.wire.material.opacity = 0.35 + sh.hit * 3;
      if (sh.t <= 0) { g.scene.remove(sh.mesh); this.shields.splice(i, 1); }
    }
    // ロケット
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      const sp = r.vel.length(), step = sp * dt;
      _v.copy(r.vel).divideScalar(sp);
      const w = g.world.raycast(r.pos, _v, step);
      const hits = g.enemies.raycast(r.pos, _v, w ? w.dist : step, 0.35);
      let boom = null;
      if (hits.length) boom = hits[0].point;
      else if (w) boom = w.point.addScaledVector(w.normal, 0.15);
      else if (r.life <= 0) boom = r.pos;
      if (boom) {
        if (r.def.gravity) this.spawnWell(boom.clone(), r.def, r.owner);
        else this.explode(boom.clone(), r.def.radius, r.def.dmg, r.owner, r.def.color);
        g.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        continue;
      }
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);
      for (let k = 0; k < 3; k++) {
        fx.spawn(r.pos.x - _v.x * k * 0.3, r.pos.y - _v.y * k * 0.3, r.pos.z - _v.z * k * 0.3, rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5), k ? 0xffcf6a : r.def.color, 0.22, 0.35, 0, 1);
      }
    }
    this.updateWells(dt);
    // 回復オーブ
    const p = g.player;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.life -= dt; o.t += dt;
      o.vel.y -= 15 * dt;
      o.pos.addScaledVector(o.vel, dt);
      if (o.pos.y < 0.5) { o.pos.y = 0.5; o.vel.set(0, 0, 0); }
      _v.subVectors(p.chest, o.pos);
      const d = _v.length();
      if (d < 7 && p.alive) { o.pos.addScaledVector(_v.normalize(), Math.min(d, 16 * dt)); o.vel.multiplyScalar(0.9); }
      o.mesh.position.set(o.pos.x, o.pos.y + Math.sin(o.t * 3) * 0.12, o.pos.z);
      o.mesh.rotation.y += dt * 3;
      if (Math.random() < 0.3) fx.spawn(o.pos.x, o.pos.y, o.pos.z, rand(-0.3, 0.3), 1, rand(-0.3, 0.3), 0x3aff9a, 0.12, 0.5);
      if (d < 1.3 && p.alive) {
        p.heal(25);
        g.audio.play('pickup');
        fx.burst(o.pos, 0x3aff9a, 20, 4, 0.12, 0.4);
        g.ui.flash('rgba(58,255,154,0.15)');
        g.scene.remove(o.mesh); this.orbs.splice(i, 1);
        g.emit('pickup');
        continue;
      }
      if (o.life <= 0) { g.scene.remove(o.mesh); this.orbs.splice(i, 1); }
      else if (o.life < 3) o.mesh.visible = Math.floor(o.life * 8) % 2 === 0;
    }
  }
}
