// エフェクト：パーティクル・弾道・爆発・光・破片
import * as THREE from 'three';

const PVERT = `attribute float size; attribute vec4 pcolor; varying vec4 vColor; uniform float uScale;
void main(){ vColor = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`;
const PFRAG = `varying vec4 vColor;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard; float a = 1.0 - d; a *= a; gl_FragColor = vec4(vColor.rgb, vColor.a * a); }`;

const _c = new THREE.Color();
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();

export class Effects {
  constructor(game) {
    this.game = game;
    const scene = this.scene = game.scene;
    const N = this.N = 4000;
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.col = new Float32Array(N * 4);
    this.base = new Float32Array(N * 4);
    this.size = new Float32Array(N);
    this.life = new Float32Array(N);
    this.max = new Float32Array(N);
    this.grav = new Float32Array(N);
    this.drag = new Float32Array(N);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('pcolor', this.aCol);
    geo.setAttribute('size', this.aSize);
    this.pmat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 } }, vertexShader: PVERT, fragmentShader: PFRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.points = new THREE.Points(geo, this.pmat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    // 弾道（細長い光る箱）
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0, 0.5);
    this.tracers = [];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 1, th: 0.02 });
    }
    this.tCursor = 0;
    // 球状の衝撃波
    const sg = new THREE.SphereGeometry(1, 28, 18);
    this.shells = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.shells.push({ mesh: m, life: 0, max: 1, r: 1 });
    }
    // 輪っか
    const rg = new THREE.RingGeometry(0.85, 1, 48);
    this.rings = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, r: 1 });
    }
    // 一瞬光るライト（数は固定にして、シェーダーの再コンパイルを防ぐ）
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 1.6);
      scene.add(l);
      this.lights.push({ light: l, life: 0, max: 1, peak: 0 });
    }
    // 破片
    const dg = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.debris = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: 0x555a66, metalness: 0.7, roughness: 0.4, emissive: 0x000000 }));
      m.visible = false; m.castShadow = true; scene.add(m);
      this.debris.push({ mesh: m, life: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    this.dCursor = 0;
  }

  setScale(heightPx, fov) {
    this.pmat.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, grav = 0, drag = 0, bright = 1.6) {
    const i = this.cursor; this.cursor = (i + 1) % this.N;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    _c.set(color);
    this.base[i4] = _c.r * bright; this.base[i4 + 1] = _c.g * bright; this.base[i4 + 2] = _c.b * bright; this.base[i4 + 3] = size;
    this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag;
  }

  burst(p, color, count, speed, size, life, grav = 0, drag = 1.5) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      this.spawn(p.x, p.y, p.z, _v.x, _v.y, _v.z, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), grav, drag);
    }
  }

  sparks(p, n, color, count = 8, speed = 9) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      if (n) _v.addScaledVector(n, 1.2).normalize();
      _v.multiplyScalar(speed * (0.3 + Math.random()));
      this.spawn(p.x, p.y, p.z, _v.x, _v.y, _v.z, i % 3 === 0 ? 0xffffff : color, 0.06 + Math.random() * 0.06, 0.25 + Math.random() * 0.3, 18, 2);
    }
    this.spawn(p.x, p.y, p.z, 0, 0, 0, color, 0.5, 0.1, 0, 0);
  }

  tracer(from, to, color, th = 0.02, life = 0.07) {
    const t = this.tracers[this.tCursor]; this.tCursor = (this.tCursor + 1) % this.tracers.length;
    const len = from.distanceTo(to);
    if (len < 0.01) return;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(th, th, len);
    t.mesh.material.color.set(color).multiplyScalar(3);
    t.mesh.material.opacity = 1;
    t.mesh.visible = true;
    t.life = life; t.max = life; t.th = th;
  }

  bolt(from, to, color, segs = 7, jitter = 0.5) {
    const len = from.distanceTo(to);
    let prev = from.clone();
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = new THREE.Vector3().lerpVectors(from, to, t);
      if (i < segs) p.add(_w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(jitter * Math.min(1, len / 6)));
      this.tracer(prev, p, color, 0.03, 0.07);
      prev = p;
    }
  }

  shell(p, r, color, life = 0.4, opacity = 0.6) {
    const s = this.shells.find((x) => x.life <= 0) || this.shells[0];
    s.mesh.position.copy(p); s.r = r; s.life = life; s.max = life; s.op = opacity;
    s.mesh.material.color.set(color).multiplyScalar(2);
    s.mesh.visible = true; s.mesh.scale.setScalar(0.01);
  }

  ring(p, color, r, life = 0.4) {
    const s = this.rings.find((x) => x.life <= 0) || this.rings[0];
    s.mesh.position.copy(p); s.r = r; s.life = life; s.max = life;
    s.mesh.material.color.set(color).multiplyScalar(3);
    s.mesh.visible = true; s.mesh.scale.setScalar(0.01);
  }

  flash(p, color, intensity = 30, life = 0.08) {
    const l = this.lights.reduce((a, b) => (a.life < b.life ? a : b));
    l.light.position.copy(p); l.light.color.set(color);
    l.peak = intensity; l.life = life; l.max = life;
    l.light.intensity = intensity;
  }

  explosion(p, radius, color, scale = 1) {
    const n = Math.floor(70 * scale);
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(radius * (1.5 + Math.random() * 3));
      const hot = Math.random() < 0.5;
      this.spawn(p.x, p.y, p.z, _v.x, _v.y, _v.z, hot ? 0xffcf6a : color, (0.25 + Math.random() * 0.5) * Math.min(2, radius / 2.5), 0.4 + Math.random() * 0.5, -1, 3.5);
    }
    for (let i = 0; i < 24 * scale; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 14);
      this.spawn(p.x, p.y, p.z, _v.x, _v.y, _v.z, 0xffffff, 0.07, 0.6 + Math.random() * 0.5, 20, 1);
    }
    this.shell(p, radius, color, 0.35, 0.7);
    this.shell(p, radius * 0.5, 0xffe0a0, 0.2, 0.9);
    this.ring(_u.set(p.x, Math.max(0.1, p.y - 0.3), p.z), color, radius * 1.4, 0.45);
    this.flash(p, color, 22 * scale, 0.25);
  }

  debrisBurst(p, color, count = 6) {
    for (let i = 0; i < count; i++) {
      const d = this.debris[this.dCursor]; this.dCursor = (this.dCursor + 1) % this.debris.length;
      d.mesh.position.copy(p).add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5));
      d.mesh.material.color.set(color);
      d.mesh.material.emissive.set(color).multiplyScalar(0.25);
      const s = 0.6 + Math.random() * 1.4;
      d.mesh.scale.set(s, s * (0.5 + Math.random()), s);
      d.vel.set((Math.random() - 0.5) * 10, 4 + Math.random() * 8, (Math.random() - 0.5) * 10);
      d.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      d.life = 2.5 + Math.random();
      d.mesh.visible = true;
    }
  }

  clear() {
    this.life.fill(0); this.size.fill(0); this.aSize.needsUpdate = true;
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
    for (const s of this.shells) { s.life = 0; s.mesh.visible = false; }
    for (const s of this.rings) { s.life = 0; s.mesh.visible = false; }
    for (const l of this.lights) { l.life = 0; l.light.intensity = 0; }
    for (const d of this.debris) { d.life = 0; d.mesh.visible = false; }
  }

  update(dt) {
    const N = this.N, P = this.pos, V = this.vel, C = this.col, B = this.base, S = this.size, L = this.life;
    for (let i = 0; i < N; i++) {
      if (L[i] <= 0) { if (S[i] !== 0) S[i] = 0; continue; }
      L[i] -= dt;
      if (L[i] <= 0) { S[i] = 0; continue; }
      const i3 = i * 3, i4 = i * 4;
      const k = L[i] / this.max[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 1] = V[i3 + 1] * dr - this.grav[i] * dt; V[i3 + 2] *= dr;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      if (P[i3 + 1] < 0.02 && this.grav[i] > 0) { P[i3 + 1] = 0.02; V[i3 + 1] *= -0.35; V[i3] *= 0.7; V[i3 + 2] *= 0.7; }
      C[i4] = B[i4]; C[i4 + 1] = B[i4 + 1]; C[i4 + 2] = B[i4 + 2]; C[i4 + 3] = Math.min(1, k * 1.4);
      S[i] = B[i4 + 3] * (0.35 + 0.65 * k);
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      const k = t.life / t.max;
      t.mesh.material.opacity = k;
      t.mesh.scale.x = t.mesh.scale.y = t.th * (0.4 + 0.6 * k);
    }
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      const k = 1 - s.life / s.max;
      s.mesh.scale.setScalar(s.r * (1 - Math.pow(1 - k, 3)));
      s.mesh.material.opacity = (1 - k) * s.op;
    }
    for (const s of this.rings) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      const k = 1 - s.life / s.max;
      s.mesh.scale.setScalar(s.r * (1 - Math.pow(1 - k, 2)));
      s.mesh.material.opacity = 1 - k;
    }
    for (const l of this.lights) {
      if (l.life <= 0) { l.light.intensity = 0; continue; }
      l.life -= dt;
      l.light.intensity = Math.max(0, l.peak * (l.life / l.max));
    }
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      d.vel.y -= 22 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt;
      if (d.mesh.position.y < 0.12) { d.mesh.position.y = 0.12; d.vel.y *= -0.35; d.vel.x *= 0.6; d.vel.z *= 0.6; d.spin.multiplyScalar(0.6); }
      if (d.life < 0.5) d.mesh.scale.multiplyScalar(0.92);
    }
  }
}
