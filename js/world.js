// ステージ（アリーナ）：見た目・当たり判定・ジャンプパッド・空・街並み
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const NEON = { cyan: 0x2fe6ff, magenta: 0xff2bd6, amber: 0xffb02e, violet: 0x8c7bff };

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function panelTextures() {
  const map = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3d4456'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const b = Math.random() > 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${b},${b},${b},${Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    const s = w / 2;
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
      const px = x * s, py = y * s;
      const grd = g.createLinearGradient(px, py, px, py + s);
      grd.addColorStop(0, 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0.16)');
      g.fillStyle = grd; g.fillRect(px + 4, py + 4, s - 8, s - 8);
      g.strokeStyle = 'rgba(8,10,16,0.95)'; g.lineWidth = 5; g.strokeRect(px + 2, py + 2, s - 4, s - 4);
      g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1.5; g.strokeRect(px + 8, py + 8, s - 16, s - 16);
      g.fillStyle = 'rgba(15,17,24,0.95)';
      [[16, 16], [s - 16, 16], [16, s - 16], [s - 16, s - 16]].forEach(([bx, by]) => {
        g.beginPath(); g.arc(px + bx, py + by, 4, 0, Math.PI * 2); g.fill();
      });
    }
    g.fillStyle = 'rgba(0,0,0,0.4)';
    for (let i = 0; i < 6; i++) g.fillRect(s + 40, 40 + i * 14, 120, 6);
    g.fillStyle = 'rgba(255,200,40,0.35)';
    for (let i = 0; i < 8; i++) { g.save(); g.translate(30 + i * 22, s + 200); g.rotate(-0.6); g.fillRect(0, 0, 10, 30); g.restore(); }
  });
  const em = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2fe6ff'; g.fillRect(30, h / 2 - 3, 100, 3); g.fillRect(w / 2 + 30, h - 14, 150, 3);
    g.fillStyle = '#ff2bd6'; g.fillRect(w - 36, 30, 4, 70);
    g.fillStyle = '#2fe6ff';
    for (let i = 0; i < 4; i++) g.fillRect(w / 2 + 40 + i * 16, h / 2 + 40, 8, 8);
  });
  return { map, em };
}

function floorTextures() {
  const n = 4;
  const map = canvasTex(1024, 1024, (g, w, h) => {
    const s = w / n;
    g.fillStyle = '#0b0d13'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const sh = 26 + Math.random() * 12;
      g.fillStyle = `rgb(${sh},${sh + 3},${sh + 12})`;
      g.fillRect(i * s + 4, j * s + 4, s - 8, s - 8);
      for (let k = 0; k < 500; k++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
        g.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 2, 2);
      }
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 2;
      g.strokeRect(i * s + 18, j * s + 18, s - 36, s - 36);
    }
  });
  const em = canvasTex(1024, 1024, (g, w, h) => {
    const s = w / n;
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(47,230,255,0.45)'; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
    }
    g.fillStyle = 'rgba(255,43,214,0.9)';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillRect(i * s + s / 2 - 10, j * s + s / 2 - 1, 20, 2);
      g.fillRect(i * s + s / 2 - 1, j * s + s / 2 - 10, 2, 20);
    }
  });
  return { map, em };
}

function windowTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cols = ['#5ff0ff', '#ff5ee0', '#ffd27a', '#9d8bff', '#ffffff'];
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) {
      if (Math.random() < 0.3) {
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.globalAlpha = 0.4 + Math.random() * 0.6;
        g.fillRect(x, y, 4, 4);
      }
    }
    g.globalAlpha = 1;
  });
}

function scaleBoxUV(geo, w, h, d, s = 4) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [a, b] = dims[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * a / s, uv.getY(idx) * b / s);
    }
  }
  uv.needsUpdate = true;
}

const SKY_V = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_F = `
varying vec3 vDir; uniform float uTime;
float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 top = vec3(0.01,0.012,0.05); vec3 mid = vec3(0.09,0.03,0.2); vec3 hor = vec3(0.62,0.16,0.48);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, top, smoothstep(0.22, 0.75, h));
  if (h < 0.0) col = mix(hor*0.5, vec3(0.02,0.01,0.04), smoothstep(0.0,-0.25,h));
  // 星
  vec3 p = d * 260.0; vec3 ip = floor(p); float s = hash(ip);
  vec3 fp = fract(p) - 0.5; float dotv = smoothstep(0.35, 0.0, length(fp));
  float star = step(0.9965, s) * dotv * smoothstep(0.05, 0.35, h);
  col += vec3(0.8,0.9,1.0) * star * (0.55 + 0.45*sin(uTime*2.0 + s*90.0)) * 1.6;
  // オーロラの帯
  float band = sin(d.x*3.0 + uTime*0.05) * 0.5 + 0.5;
  col += vec3(0.1,0.5,0.6) * smoothstep(0.25,0.0,abs(h-0.32 - band*0.08)) * 0.18;
  gl_FragColor = vec4(col, 1.0);
}`;

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.colliders = [];
    this.pads = [];
    this.spawnPoints = [];
    this.anim = [];
    this.time = 0;
    this.mergeBuckets = new Map(); // material -> geometries
    this.trimBuckets = new Map();  // color -> geometries
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.buildMaterials();
    this.buildLights(game.renderer);
    this.buildArena();
    this.flush();
    this.buildSky();
    this.buildSkyline();
    this.realLevel = 0;
    this.ready = this.loadRealistic(game.settings.quality === 'high');
  }

  // 写真素材（Poly Haven / CC0）で床・壁・箱をリアル寄りにする。
  // full=false（軽量画質）のときは色の画像だけ読み、凹凸・ざらつき・夜の写真は読まない
  async loadRealistic(full) {
    const want = full ? 2 : 1;
    if (this.realLevel >= want) return;
    this.realLevel = want;
    const tl = new THREE.TextureLoader();
    const maxAniso = this.game.renderer.capabilities.getMaxAnisotropy();
    const load = (name, srgb) => new Promise((res) => tl.load(`assets/tex/${name}`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, maxAniso);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      res(t);
    }, undefined, () => res(null)));
    const apply = async (mat, name, repeat, tint, extra = {}) => {
      const [d, n, a] = await Promise.all([
        load(`${name}_diff_1k.jpg`, true),
        full ? load(`${name}_nor_gl_1k.jpg`, false) : null,
        full ? load(`${name}_arm_1k.jpg`, false) : null,
      ]);
      if (!d) return;
      for (const t of [d, n, a]) if (t) t.repeat.set(repeat, repeat);
      mat.map = d;
      mat.color.set(!a && extra.tintLow !== undefined ? extra.tintLow : tint);
      if (n) { mat.normalMap = n; mat.normalScale.set(extra.normal ?? 1, extra.normal ?? 1); }
      if (a) {
        mat.aoMap = a; mat.aoMapIntensity = 0.9;
        mat.roughnessMap = a; mat.metalnessMap = a;
        mat.roughness = extra.rough ?? 1; mat.metalness = extra.metal ?? 1;
      } else {
        mat.roughness = extra.roughFallback ?? 0.55; mat.metalness = extra.metalFallback ?? 0.4;
      }
      if (mat.emissiveMap) mat.emissiveIntensity = extra.emissive ?? mat.emissiveIntensity;
      mat.needsUpdate = true;
      if (extra.keep && n && a) this.detail = { normal: n, arm: a };
    };
    const jobs = [
      apply(this.matFloor, 'hangar_concrete_floor', 52, 0x9aa0b4, { emissive: 0.22, normal: 1.2, metal: 0.6, rough: 0.9, metalFallback: 0.05, roughFallback: 0.85, tintLow: 0x6a7080 }),
      apply(this.matWall, 'metal_plate_02', 2, 0xb4bccd, { emissive: 0.45, metalFallback: 0.5, roughFallback: 0.45, keep: true }),
      apply(this.matDark, 'metal_plate', 2, 0x6c7385, { metalFallback: 0.7, roughFallback: 0.35 }),
      apply(this.matCrate, 'container_side', 1.5, 0xc4beb2, { emissive: 0.35, metalFallback: 0.4, roughFallback: 0.5 }),
    ];
    if (full) {
      jobs.push(new Promise((res) => new RGBELoader().load('assets/hdri/rooftop_night_1k.hdr', (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.environment = this.pmrem.fromEquirectangular(hdr).texture;
        this.scene.environmentIntensity = 0.9;
        hdr.dispose();
        res();
      }, undefined, () => res())));
    }
    await Promise.all(jobs);
  }

  buildMaterials() {
    const p = panelTextures();
    const f = floorTextures();
    this.matWall = new THREE.MeshStandardMaterial({ map: p.map, emissiveMap: p.em, emissive: 0xffffff, emissiveIntensity: 0.7, color: 0x9ca6bd, metalness: 0.55, roughness: 0.42 });
    this.matDark = new THREE.MeshStandardMaterial({ map: p.map, color: 0x4a5062, metalness: 0.75, roughness: 0.3 });
    this.matCrate = new THREE.MeshStandardMaterial({ map: p.map, emissiveMap: p.em, emissive: 0xffffff, emissiveIntensity: 0.8, color: 0xc77a3a, metalness: 0.4, roughness: 0.5 });
    f.map.repeat.set(19.75, 19.75); f.em.repeat.set(19.75, 19.75);
    this.matFloor = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.em, emissive: 0xffffff, emissiveIntensity: 0.32, metalness: 0.6, roughness: 0.34 });
    this.trimMats = {};
    for (const k in NEON) this.trimMats[k] = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON[k]).multiplyScalar(2.6) });
  }

  buildLights(renderer) {
    const pmrem = this.pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    const hemi = new THREE.HemisphereLight(0x9fb4ff, 0x2a1438, 0.7);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd9c2, 2.0);
    sun.position.set(50, 85, 30);
    sun.castShadow = true;
    const hq = this.game.settings.quality === 'high';
    sun.shadow.mapSize.set(hq ? 4096 : 2048, hq ? 4096 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -86; sc.right = 86; sc.top = 86; sc.bottom = -86; sc.near = 1; sc.far = 200;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
    const rim = new THREE.DirectionalLight(0xff4fd8, 0.6);
    rim.position.set(-40, 20, -30);
    this.scene.add(rim);
    const l1 = new THREE.PointLight(0xff2bd6, 22, 30, 1.6); l1.position.set(0, 9, 0); this.scene.add(l1);
    const l2 = new THREE.PointLight(0x2fe6ff, 10, 30, 1.6); l2.position.set(0, 6, 30); this.scene.add(l2);
    this.coreLight = l1;
  }

  addCollider(x0, y0, z0, x1, y1, z1) {
    this.colliders.push({ min: [x0, y0, z0], max: [x1, y1, z1] });
  }

  // (x,z)=中心, y=底面
  addBox(x, y, z, w, h, d, mat, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(geo, w, h, d);
    geo.translate(x, y + h / 2, z);
    if (!this.mergeBuckets.has(mat)) this.mergeBuckets.set(mat, []);
    this.mergeBuckets.get(mat).push(geo);
    if (opts.collide !== false) this.addCollider(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
    if (opts.trim) this.addTrim(x, y + h, z, w, d, opts.trim);
    if (opts.midTrim) this.addTrim(x, y + opts.midTrim, z, w, d, opts.trim || 'cyan', 0.05);
  }

  addTrim(x, y, z, w, d, color, t = 0.08) {
    const o = 0.015;
    const parts = [
      [x, y, z - d / 2 - o, w + 2 * o, t, t],
      [x, y, z + d / 2 + o, w + 2 * o, t, t],
      [x - w / 2 - o, y, z, t, t, d + 2 * o],
      [x + w / 2 + o, y, z, t, t, d + 2 * o],
    ];
    if (!this.trimBuckets.has(color)) this.trimBuckets.set(color, []);
    for (const [px, py, pz, pw, ph, pd] of parts) {
      const g = new THREE.BoxGeometry(pw, ph, pd);
      g.translate(px, py - ph / 2, pz);
      this.trimBuckets.get(color).push(g);
    }
  }

  addVStrip(x, y0, y1, z, color) {
    const g = new THREE.BoxGeometry(0.1, y1 - y0, 0.1);
    g.translate(x, (y0 + y1) / 2, z);
    if (!this.trimBuckets.has(color)) this.trimBuckets.set(color, []);
    this.trimBuckets.get(color).push(g);
  }

  flush() {
    for (const [mat, geos] of this.mergeBuckets) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
      geos.forEach((g) => g.dispose());
    }
    for (const [color, geos] of this.trimBuckets) {
      const m = new THREE.Mesh(mergeGeometries(geos), this.trimMats[color]);
      this.group.add(m);
      geos.forEach((g) => g.dispose());
    }
    this.mergeBuckets.clear(); this.trimBuckets.clear();
  }

  addPad(x, z, dx, dz, push = 7.5, up = 19) {
    const pos = new THREE.Vector3(x, 0, z);
    const g = new THREE.Group();
    g.position.copy(pos);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.16, 32), this.matDark);
    base.position.y = 0.08; base.receiveShadow = true;
    g.add(base);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.35, 40), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.18;
    g.add(ring);
    const arrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 3), arrowMat);
    arrow.rotation.x = Math.PI / 2; arrow.rotation.z = 0;
    const holder = new THREE.Group(); holder.add(arrow);
    holder.rotation.y = Math.atan2(dx, dz);
    arrow.rotation.set(Math.PI / 2, 0, 0);
    holder.position.y = 0.3;
    g.add(holder);
    // 上昇する光の柱
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(1.2), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 3, 24, 1, true), beamMat);
    beam.position.y = 1.6;
    g.add(beam);
    this.group.add(g);
    const pad = { pos, dir: new THREE.Vector3(dx, 0, dz).normalize(), push, up, r: 1.5, ring, beam, arrow: holder };
    this.pads.push(pad);
    return pad;
  }

  sign(text, sub, x, y, z, ry, w = 16, color = '#2fe6ff') {
    const tex = canvasTex(1024, 256, (g, cw, ch) => {
      g.clearRect(0, 0, cw, ch);
      g.font = '900 120px Orbitron, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 30;
      g.fillStyle = color; g.fillText(text, cw / 2, ch / 2 - 20);
      g.font = '700 38px Orbitron, sans-serif';
      g.fillStyle = '#ffffff'; g.shadowBlur = 10;
      g.fillText(sub, cw / 2, ch / 2 + 70);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(1.6, 1.6, 1.6), depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    this.group.add(m);
    return { mesh: m, tex };
  }

  buildArena() {
    const S = this.S = 78;      // マップの半分の大きさ
    const IN = 46;              // 中央エリアの半分の大きさ
    this.floorSize = S * 2;
    // 床
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, S * 2), this.matFloor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.group.add(floor);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x07060c, roughness: 0.9 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05;
    this.group.add(outer);

    // 外周の壁
    const WH = 18;
    this.addBox(0, 0, -S - 1, S * 2 + 4, WH, 2, this.matWall, { trim: 'magenta', midTrim: 7 });
    this.addBox(0, 0, S + 1, S * 2 + 4, WH, 2, this.matWall, { trim: 'magenta', midTrim: 7 });
    this.addBox(-S - 1, 0, 0, 2, WH, S * 2, this.matWall, { trim: 'cyan', midTrim: 7 });
    this.addBox(S + 1, 0, 0, 2, WH, S * 2, this.matWall, { trim: 'cyan', midTrim: 7 });
    this.addCollider(-S - 3, WH, -S - 3, S + 3, 120, -S);
    this.addCollider(-S - 3, WH, S, S + 3, 120, S + 3);
    this.addCollider(-S - 3, WH, -S, -S, 120, S);
    this.addCollider(S, WH, -S, S + 3, 120, S);
    for (let i = -65; i <= 65; i += 13) {
      this.addBox(i, 0, -S + 0.4, 1.4, WH, 0.8, this.matDark, { collide: false });
      this.addBox(i, 0, S - 0.4, 1.4, WH, 0.8, this.matDark, { collide: false });
      this.addBox(-S + 0.4, 0, i, 0.8, WH, 1.4, this.matDark, { collide: false });
      this.addBox(S - 0.4, 0, i, 0.8, WH, 1.4, this.matDark, { collide: false });
      this.addVStrip(i, 0.5, WH - 0.5, -S + 0.85, 'cyan');
      this.addVStrip(i, 0.5, WH - 0.5, S - 0.85, 'cyan');
      this.addVStrip(-S + 0.85, 0.5, WH - 0.5, i, 'magenta');
      this.addVStrip(S - 0.85, 0.5, WH - 0.5, i, 'magenta');
    }

    // 中央エリアを囲む低い壁（真ん中と両わきに通り道）
    const iw = 6;
    for (const side of [-1, 1]) {
      for (const [a, b] of [[-IN, -26], [-18, -9], [9, 18], [26, IN]]) {
        const len = b - a, mid = (a + b) / 2;
        this.addBox(mid, 0, side * (IN + 1), len, iw, 1.6, this.matWall, { trim: 'magenta' });
        this.addBox(side * (IN + 1), 0, mid, 1.6, iw, len, this.matWall, { trim: 'cyan' });
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.addBox(sx * (IN + 1), 0, sz * (IN + 1), 3, iw + 2, 3, this.matDark, { trim: 'amber' });

    this.buildDistricts(S, IN);

    // 中央タワー
    this.addBox(0, 0, 0, 10, 5, 10, this.matWall, { trim: 'magenta', midTrim: 2.5 });
    this.addBox(-3.2, 5, -4.55, 3, 0.9, 0.7, this.matDark, { trim: 'cyan' });
    this.addBox(3.2, 5, 4.55, 3, 0.9, 0.7, this.matDark, { trim: 'cyan' });
    this.addBox(-4.55, 5, 3.2, 0.7, 0.9, 3, this.matDark, { trim: 'cyan' });
    this.addBox(4.55, 5, -3.2, 0.7, 0.9, 3, this.matDark, { trim: 'cyan' });

    // 四隅の高台
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.addBox(sx * 30, 0, sz * 30, 14, 4, 14, this.matWall, { trim: 'cyan', midTrim: 2 });
      this.addBox(sx * 26, 4, sz * 33, 3, 1.1, 1.2, this.matCrate, { trim: 'amber' });
      this.addBox(sx * 33, 4, sz * 26, 1.2, 1.1, 3, this.matCrate, { trim: 'amber' });
    }
    // 南北の空中通路
    for (const sz of [-1, 1]) {
      this.addBox(0, 3.4, sz * 30, 46, 0.6, 4, this.matDark, { trim: 'amber' });
      for (const px of [-11.5, 0, 11.5]) this.addBox(px, 0, sz * 30, 0.8, 3.4, 0.8, this.matDark);
      this.addBox(-6, 4, sz * 31.6, 4, 0.8, 0.4, this.matDark, { trim: 'amber' });
      this.addBox(6, 4, sz * 28.4, 4, 0.8, 0.4, this.matDark, { trim: 'amber' });
    }

    // 遮蔽物
    const covers = [
      [-12, -6, 3, 1.6, 6], [12, 6, 3, 1.6, 6], [0, -20, 8, 1.4, 2], [0, 20, 8, 1.4, 2],
      [-24, 0, 3, 3, 8], [24, 0, 3, 3, 8], [-36, -6, 2, 2.4, 6], [36, 6, 2, 2.4, 6],
      [-8, 34, 5, 2, 2], [8, -34, 5, 2, 2],
    ];
    for (const [x, z, w, h, d] of covers) this.addBox(x, 0, z, w, h, d, this.matWall, { trim: 'cyan' });
    const crates = [[-20, 12], [20, -12], [-34, 10], [34, -10], [14, 38], [-14, -38], [-6, 12], [6, -12], [-17, -22], [17, 22]];
    for (const [x, z] of crates) {
      this.addBox(x, 0, z, 2, 2, 2, this.matCrate, { trim: 'amber' });
      if (Math.abs(x) > 15) this.addBox(x + 0.3, 2, z - 0.2, 1.2, 1.2, 1.2, this.matCrate);
    }
    // 柱（グラップルで飛び移れる）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.addBox(sx * 17, 0, sz * 14, 2, 12, 2, this.matDark, { trim: 'magenta' });
      this.addVStrip(sx * 17 + 1.02, 0.5, 11.5, sz * 14, 'magenta');
      this.addVStrip(sx * 17 - 1.02, 0.5, 11.5, sz * 14, 'magenta');
    }

    // ジャンプパッド
    this.addPad(0, 9.5, 0, -1);
    this.addPad(0, -9.5, 0, 1);
    this.addPad(9.5, 0, -1, 0);
    this.addPad(-9.5, 0, 1, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.addPad(sx * 19, sz * 25.5, sx, 0, 8, 19);

    // タワー上のコア（演出）
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x220018, emissive: NEON.magenta, emissiveIntensity: 2.5, metalness: 0.2, roughness: 0.2 });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), coreMat);
    core.position.set(0, 10, 0);
    this.group.add(core);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(2.4) });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.05, 8, 80), ringMat); r1.position.copy(core.position);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.035, 8, 80), this.trimMats.magenta); r2.position.copy(core.position);
    this.group.add(r1, r2);
    this.anim.push((t) => {
      core.rotation.y = t * 0.8; core.position.y = 10 + Math.sin(t * 1.3) * 0.35;
      r1.rotation.set(t * 0.6, t * 0.4, 0); r2.rotation.set(-t * 0.3, 0, t * 0.5);
      r1.position.y = r2.position.y = core.position.y;
    });

    // 看板
    this.sign('ECHO//BREAK', 'SECTOR-07  ·  COMBAT SIMULATION', 0, 12, -S + 0.1, 0, 26, '#2fe6ff');
    this.sign('WARNING', 'HOSTILE UNITS DETECTED', 0, 12, S - 0.1, Math.PI, 20, '#ff2bd6');
    this.sign('ARENA 07', 'REWIND · REPLAY · DESTROY', -S + 0.1, 12, 0, Math.PI / 2, 20, '#ffb02e');
    this.sign('ECHO LINK', 'MEMORY BUFFER: 5.0 SEC', S - 0.1, 12, 0, -Math.PI / 2, 20, '#8c7bff');

    // 敵の出現位置
    const cand = [
      [-40, -15], [40, 15], [-40, 15], [40, -15], [-15, -40], [15, 40], [15, -40], [-15, 40],
      [0, -40], [0, 40], [-40, 0], [40, 0], [-28, 0], [28, 0], [0, -26], [0, 26],
      [-60, -60], [60, -60], [-60, 60], [60, 60], [0, -62], [0, 62], [-62, 0], [62, 0],
      [-30, -66], [30, -66], [-30, 66], [30, 66], [-66, -30], [66, -30], [-66, 30], [66, 30],
    ];
    for (const [x, z] of cand) if (this.free(x, 0, z, 1.0, 3.1)) this.spawnPoints.push(new THREE.Vector3(x, 0, z));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.spawnPoints.push(new THREE.Vector3(sx * 30, 4, sz * 30));
  }

  // 中央の外側に広がる4つのエリア
  buildDistricts(S, IN) {
    const o = IN + 3; // 外側エリアの内側の端
    // ---- 北：コンテナヤード ----
    const cont = (x, z, rot, stack = 1) => {
      for (let k = 0; k < stack; k++) {
        if (rot) this.addBox(x, k * 2.7, z, 6.2, 2.6, 2.5, this.matCrate, { trim: k === stack - 1 ? 'amber' : null });
        else this.addBox(x, k * 2.7, z, 2.5, 2.6, 6.2, this.matCrate, { trim: k === stack - 1 ? 'amber' : null });
      }
    };
    const yard = [[-58, -56, 1, 2], [-50, -64, 0, 1], [-38, -58, 1, 1], [-30, -68, 1, 3], [-18, -56, 0, 2], [-8, -66, 1, 1],
      [8, -58, 1, 2], [16, -68, 0, 1], [26, -56, 1, 1], [34, -64, 0, 2], [46, -58, 1, 3], [58, -66, 1, 1], [64, -54, 0, 2]];
    for (const [x, z, r, st] of yard) cont(x, z, r, st);
    // クレーン
    for (const cx of [-24, 30]) {
      this.addBox(cx - 6, 0, -72, 1.2, 16, 1.2, this.matDark, { trim: 'amber' });
      this.addBox(cx + 6, 0, -72, 1.2, 16, 1.2, this.matDark, { trim: 'amber' });
      this.addBox(cx, 16, -72, 14, 1, 1.4, this.matDark, { trim: 'amber' });
      this.addBox(cx, 8, -72, 3, 1.4, 3, this.matCrate, { collide: false });
    }
    this.addPad(-12, -52, 0, -1, 6, 19);
    this.addPad(40, -52, 0, -1, 6, 19);

    // ---- 南：プラザ ----
    // 階段つきのステージ
    this.addBox(0, 0, 64, 24, 3, 10, this.matWall, { trim: 'cyan', midTrim: 1.5 });
    for (let i = 0; i < 4; i++) this.addBox(0, 0, 58.5 - i, 10, 2.4 - i * 0.6, 1.0, this.matDark, { trim: i === 0 ? 'cyan' : null });
    this.addBox(0, 3, 67, 6, 6, 2, this.matDark, { trim: 'magenta' });
    // 植え込み・ベンチ
    for (const [x, z] of [[-30, 56], [30, 56], [-44, 66], [44, 66], [-18, 72], [18, 72], [-56, 54], [56, 54]]) {
      this.addBox(x, 0, z, 5, 1.2, 5, this.matDark, { trim: 'cyan' });
    }
    // 記念塔（グラップル用）
    for (const x of [-38, 38]) {
      this.addBox(x, 0, 62, 2.4, 20, 2.4, this.matWall, { trim: 'magenta' });
      this.addVStrip(x + 1.22, 0.5, 19.5, 62, 'magenta');
      this.addVStrip(x - 1.22, 0.5, 19.5, 62, 'magenta');
    }

    // ---- 東：ルーフトップ ----
    const roofs = [[56, -36, 12, 3, 10], [66, -14, 10, 6, 12], [56, 10, 12, 9, 10], [68, 34, 10, 5, 14], [54, 56, 12, 3, 10]];
    for (const [x, z, w, h, d] of roofs) {
      this.addBox(x, 0, z, w, h, d, this.matWall, { trim: 'cyan', midTrim: h / 2 });
      this.addBox(x - w / 2 + 1, h, z, 0.6, 1, d, this.matDark, { trim: 'amber' });
    }
    // 屋根どうしをつなぐ橋
    this.addBox(61, 5.4, -25, 3, 0.6, 6, this.matDark, { trim: 'amber' });
    this.addBox(61, 8.4, -2, 3, 0.6, 6, this.matDark, { trim: 'amber' });
    this.addPad(52, -24, 1, 0, 7, 19);
    this.addPad(50, 22, 1, 0, 7, 22);
    this.addPad(50, 34, 1, 0, 8, 18);

    // ---- 西：ファクトリー ----
    for (const [x, z] of [[-60, -30], [-66, -10], [-60, 14], [-68, 36]]) {
      this.addBox(x, 0, z, 6, 9, 6, this.matDark, { trim: 'magenta', midTrim: 4.5 }); // タンク
    }
    // 高い通路（キャットウォーク）
    this.addBox(-54, 5, 0, 3, 0.6, 70, this.matDark, { trim: 'amber' });
    for (const z of [-30, -15, 0, 15, 30]) this.addBox(-54, 0, z, 0.8, 5, 0.8, this.matDark);
    this.addPad(-50, -40, -1, 0, 5, 18);
    this.addPad(-50, 40, -1, 0, 5, 18);
    // パイプ
    for (const y of [2.2, 4.0]) this.addBox(-74, y, 0, 1.2, 1.2, 120, this.matDark, { trim: 'cyan' });
    // 西のバリケード
    for (const [x, z] of [[-60, -52], [-60, 52], [-66, 24], [-58, -2]]) this.addBox(x, 0, z, 4, 1.6, 1.2, this.matWall, { trim: 'cyan' });
  }

  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_V, fragmentShader: SKY_F, uniforms: { uTime: { value: 0 } }, side: THREE.BackSide, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.scene.add(sky);
    // 空の巨大リング
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.25, 0.85).multiplyScalar(2.2), fog: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(200, 1.6, 12, 220), ringMat);
    ring.position.set(60, 140, -520); ring.rotation.set(1.15, 0.2, 0.3);
    this.scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(230, 0.6, 8, 220), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1.0).multiplyScalar(1.8), fog: false }));
    ring2.position.copy(ring.position); ring2.rotation.copy(ring.rotation);
    this.scene.add(ring2);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 32), new THREE.MeshStandardMaterial({ color: 0x2a1840, emissive: 0x3a0a40, emissiveIntensity: 0.6, roughness: 0.8, fog: false }));
    planet.position.copy(ring.position);
    this.scene.add(planet);
    this.anim.push((t) => { ring.rotation.z = 0.3 + t * 0.01; ring2.rotation.z = 0.3 - t * 0.007; });
  }

  buildSkyline() {
    const tex = windowTexture();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0b0c14, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.4, metalness: 0.5, roughness: 0.6 });
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const N = 170;
    const inst = new THREE.InstancedMesh(geo, mat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 115 + Math.random() * 200;
      p.set(Math.cos(a) * r, -1, Math.sin(a) * r);
      s.set(8 + Math.random() * 14, 20 + Math.random() * (r > 160 ? 120 : 70), 8 + Math.random() * 14);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    this.scene.add(inst);
    // 屋上の赤いランプ
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.2).multiplyScalar(3) });
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 6, 4), lampMat, N);
    for (let i = 0; i < N; i++) {
      inst.getMatrixAt(i, m); m.decompose(p, q, s);
      p.y += s.y + 0.6; s.set(1, 1, 1); m.compose(p, q, s); lamps.setMatrixAt(i, m);
    }
    this.scene.add(lamps);
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.skyMat.uniforms.uTime.value = t;
    for (const f of this.anim) f(t);
    for (const p of this.pads) {
      const k = (t * 1.4 + p.pos.x * 0.1) % 1;
      p.ring.scale.setScalar(0.7 + k * 0.5);
      p.ring.material.opacity = 1 - k;
      p.beam.material.opacity = 0.12 + Math.sin(t * 4) * 0.05;
      p.arrow.position.y = 0.4 + ((t * 1.5) % 1) * 1.6;
    }
    this.coreLight.intensity = 20 + Math.sin(t * 2.6) * 6;
  }

  // ---- 当たり判定 ----
  free(x, y, z, r, h) {
    for (const c of this.colliders) {
      if (x - r < c.max[0] && x + r > c.min[0] && y < c.max[1] && y + h > c.min[1] && z - r < c.max[2] && z + r > c.min[2]) return false;
    }
    return true;
  }

  overlapAny(b) { return !this.free(b.pos.x, b.pos.y, b.pos.z, b.r, b.h); }

  moveBody(b, dt) {
    const v = b.vel;
    const dist = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.25));
    const sdt = dt / steps;
    b.onGround = false; b.hitWall = false;
    for (let s = 0; s < steps; s++) {
      this._axis(b, 0, v.x * sdt);
      this._axis(b, 2, v.z * sdt);
      this._axis(b, 1, v.y * sdt);
    }
  }

  _axis(b, a, amt) {
    if (amt === 0) return;
    const p = b.pos;
    if (a === 0) p.x += amt; else if (a === 1) p.y += amt; else p.z += amt;
    const r = b.r, h = b.h;
    for (const c of this.colliders) {
      if (!(p.x - r < c.max[0] && p.x + r > c.min[0] && p.y < c.max[1] && p.y + h > c.min[1] && p.z - r < c.max[2] && p.z + r > c.min[2])) continue;
      if (a === 1) {
        if (amt > 0) { p.y = c.min[1] - h - 0.001; if (b.vel.y > 0) b.vel.y = 0; }
        else { p.y = c.max[1]; if (b.vel.y < 0) b.vel.y = 0; b.onGround = true; }
      } else {
        const stepH = c.max[1] - p.y;
        if (b.canStep && b.wasGrounded && stepH > 0 && stepH <= 0.65 && this.free(p.x, c.max[1] + 0.01, p.z, r, h)) {
          p.y = c.max[1] + 0.001; continue;
        }
        if (a === 0) { p.x = amt > 0 ? c.min[0] - r - 0.001 : c.max[0] + r + 0.001; b.vel.x = 0; }
        else { p.z = amt > 0 ? c.min[2] - r - 0.001 : c.max[2] + r + 0.001; b.vel.z = 0; }
        b.hitWall = true;
      }
    }
    if (a === 1 && p.y < 0 && !b.noFloor) { p.y = 0; if (b.vel.y < 0) b.vel.y = 0; b.onGround = true; }
  }

  // レイ（光線）と箱の交差を計算。床(y=0)も含む
  raycast(o, d, maxDist) {
    let best = maxDist, nAxis = -1, nSign = 0;
    if (d.y < -1e-6) { const t = -o.y / d.y; if (t >= 0 && t < best) { best = t; nAxis = 1; nSign = 1; } }
    const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
    for (const c of this.colliders) {
      let tmin = 0, tmax = best, axis = -1, sign = 0, ok = true;
      for (let k = 0; k < 3; k++) {
        const mn = c.min[k], mx = c.max[k];
        if (Math.abs(da[k]) < 1e-9) { if (oa[k] < mn || oa[k] > mx) { ok = false; break; } continue; }
        const inv = 1 / da[k];
        let t1 = (mn - oa[k]) * inv, t2 = (mx - oa[k]) * inv, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = k; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && axis >= 0 && tmin < best) { best = tmin; nAxis = axis; nSign = sign; }
    }
    if (nAxis < 0) return null;
    const normal = new THREE.Vector3();
    normal.setComponent(nAxis, nSign);
    return { dist: best, point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best), normal };
  }

  los(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 0.01) return true;
    d.divideScalar(len);
    return !this.raycast(a, d, len - 0.3);
  }
}
