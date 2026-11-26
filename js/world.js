// ステージ：見た目・当たり判定・ジャンプパッド・空・街並み・ギミック（動く床・加速レーン・レーザー・爆発ドラム缶）
// マップごとの組み立ては maps.js。ここはどのマップでも使う部品
import * as THREE from 'three';
import { MAPS } from './maps.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const NEON = { cyan: 0x2fe6ff, magenta: 0xff2bd6, amber: 0xffb02e, violet: 0x8c7bff };

export function canvasTex(w, h, draw, srgb = true) {
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

function dayWindowTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#8fa3b8'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 16) for (let x = 6; x < w; x += 16) {
      const v = 120 + Math.random() * 90;
      g.fillStyle = `rgb(${v * 0.55},${v * 0.75},${v})`;
      g.fillRect(x, y, 10, 11);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, y, 10, 2);
    }
  });
}

export function scaleBoxUV(geo, w, h, d, s = 4) {
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
varying vec3 vDir; uniform float uTime; uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform float uStars; uniform float uDay; uniform vec3 uSunDir;
float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5), b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5);
  float c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5), d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.22, h));
  col = mix(col, uTop, smoothstep(0.22, 0.75, h));
  if (h < 0.0) col = mix(uHor*0.6, uHor*0.25, smoothstep(0.0,-0.25,h));
  // 星
  vec3 p = d * 260.0; vec3 ip = floor(p); float s = hash(ip);
  vec3 fp = fract(p) - 0.5; float dotv = smoothstep(0.35, 0.0, length(fp));
  float star = step(0.9965, s) * dotv * smoothstep(0.05, 0.35, h);
  col += vec3(0.8,0.9,1.0) * star * (0.55 + 0.45*sin(uTime*2.0 + s*90.0)) * 1.6 * uStars;
  // オーロラの帯（夜だけ）
  float band = sin(d.x*3.0 + uTime*0.05) * 0.5 + 0.5;
  col += vec3(0.1,0.5,0.6) * smoothstep(0.25,0.0,abs(h-0.32 - band*0.08)) * 0.18 * uStars;
  // 昼：太陽と雲
  if (uDay > 0.5) {
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    col += vec3(1.0,0.92,0.75) * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.35);
    vec2 cp = d.xz / max(h, 0.05) * 1.3 + vec2(uTime*0.01, 0.0);
    float cl = n2(cp) * 0.55 + n2(cp*2.3) * 0.3 + n2(cp*5.1) * 0.15;
    cl = smoothstep(0.52, 0.8, cl) * smoothstep(0.02, 0.2, h);
    col = mix(col, vec3(1.0), cl * 0.85);
  }
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
    this.buildMaterials();
    this.pmrem = new THREE.PMREMGenerator(game.renderer);
    this.envRoom = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.envNight = null;
    this.mapId = null;
    this.load('neon');
    this.realLevel = 0;
    this.ready = this.loadRealistic(game.settings.quality === 'high');
  }

  // マップを組み立て直す（前のマップは片付ける）
  load(id) {
    if (!MAPS[id]) id = 'neon';
    if (this.mapId === id && this.root) return;
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.mapId = id;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.group = this.root;
    this.colliders = []; this.pads = []; this.spawnPoints = []; this.anim = [];
    this.movers = []; this.boosts = []; this.lasers = []; this.barrels = []; this.powerSpots = [];
    this.pendingBlasts = [];
    this.mergeBuckets.clear(); this.trimBuckets.clear();
    this.coreLight = null; this.skyMat = null;
    this.cfg = MAPS[id].build(this);
    this.flush();
    this.B = this.cfg.B;
    this.applyCfg();
  }

  applyCfg() {
    const c = this.cfg, g = this.game;
    if (this.scene.fog) { this.scene.fog.color.set(c.fog); this.scene.fog.density = c.fogD; }
    g.renderer.toneMappingExposure = c.exposure;
    this.scene.environment = c.day ? this.envRoom : (this.envNight || this.envRoom);
    this.scene.environmentIntensity = c.day ? c.env : (this.envNight ? 0.55 : 0.32);
    if (g.bloom) g.bloom.strength = c.bloom;
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
      apply(this.matFloor, 'hangar_concrete_floor', 52, 0x9aa0b4, { emissive: 0.08, normal: 1.2, metal: 0.3, rough: 0.9, metalFallback: 0.05, roughFallback: 0.85, tintLow: 0x6a7080 }),
      apply(this.matWall, 'metal_plate_02', 2, 0xb4bccd, { emissive: 0.22, metalFallback: 0.4, roughFallback: 0.6, keep: true }),
      apply(this.matDark, 'metal_plate', 2, 0x6c7385, { metalFallback: 0.55, roughFallback: 0.55 }),
      apply(this.matCrate, 'container_side', 1.5, 0xc4beb2, { emissive: 0.15, metalFallback: 0.3, roughFallback: 0.65 }),
    ];
    if (full) {
      jobs.push(new Promise((res) => new RGBELoader().load('assets/hdri/rooftop_night_1k.hdr', (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        this.envNight = this.pmrem.fromEquirectangular(hdr).texture;
        this.applyCfg();
        hdr.dispose();
        res();
      }, undefined, () => res())));
    }
    await Promise.all(jobs);
    this.texReady = true;
  }

  buildMaterials() {
    const p = panelTextures();
    const f = floorTextures();
    this.matWall = new THREE.MeshStandardMaterial({ map: p.map, emissiveMap: p.em, emissive: 0xffffff, emissiveIntensity: 0.35, color: 0x9ca6bd, metalness: 0.4, roughness: 0.6 });
    this.matDark = new THREE.MeshStandardMaterial({ map: p.map, color: 0x4a5062, metalness: 0.55, roughness: 0.55 });
    this.matCrate = new THREE.MeshStandardMaterial({ map: p.map, emissiveMap: p.em, emissive: 0xffffff, emissiveIntensity: 0.35, color: 0xc77a3a, metalness: 0.3, roughness: 0.65 });
    f.map.repeat.set(19.75, 19.75); f.em.repeat.set(19.75, 19.75);
    this.matFloor = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.em, emissive: 0xffffff, emissiveIntensity: 0.12, metalness: 0.3, roughness: 0.7 });
    this.trimMats = {};
    for (const k in NEON) this.trimMats[k] = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON[k]).multiplyScalar(1.15) });
  }

  // o: { hemiSky, hemiGround, hemiI, sun, sunI, sunPos, shadowR, rim, rimI }
  buildLights(o) {
    const hemi = new THREE.HemisphereLight(o.hemiSky, o.hemiGround, o.hemiI);
    this.root.add(hemi);
    const sun = new THREE.DirectionalLight(o.sun, o.sunI);
    sun.position.set(...o.sunPos);
    sun.castShadow = true;
    const hq = this.game.settings.quality === 'high';
    sun.shadow.mapSize.set(hq ? 4096 : 2048, hq ? 4096 : 2048);
    const sc = sun.shadow.camera, R = o.shadowR;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    this.root.add(sun); this.root.add(sun.target);
    this.sun = sun;
    if (o.rim) {
      const rim = new THREE.DirectionalLight(o.rim, o.rimI);
      rim.position.set(-40, 20, -30);
      this.root.add(rim);
    }
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

  // 空。o: { top, mid, hor, stars, day, sunDir }
  buildSky(o) {
    const C = (c) => new THREE.Color(c);
    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, uniforms: {
      uTime: { value: 0 }, uTop: { value: C(o.top) }, uMid: { value: C(o.mid) }, uHor: { value: C(o.hor) },
      uStars: { value: o.stars ?? 1 }, uDay: { value: o.day ? 1 : 0 }, uSunDir: { value: new THREE.Vector3(...(o.sunDir || [0.4, 0.6, 0.3])) },
    } });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.root.add(sky);
  }

  // 遠くのビル群。o: { rMin, rMax, n, day }
  buildSkyline(o) {
    const day = !!o.day;
    const tex = day ? dayWindowTexture() : windowTexture();
    const mat = day
      ? new THREE.MeshStandardMaterial({ color: 0xc9d3e0, map: tex, metalness: 0.35, roughness: 0.5 })
      : new THREE.MeshStandardMaterial({ color: 0x0b0c14, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.6 });
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const N = o.n || 170;
    const inst = new THREE.InstancedMesh(geo, mat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = o.rMin + Math.random() * (o.rMax - o.rMin);
      p.set(Math.cos(a) * r, -1, Math.sin(a) * r);
      s.set(10 + Math.random() * 16, 24 + Math.random() * (r > o.rMin + 60 ? 130 : 80), 10 + Math.random() * 16);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    this.root.add(inst);
    if (day) return;
    // 屋上の赤いランプ
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.2).multiplyScalar(3) });
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 6, 4), lampMat, N);
    for (let i = 0; i < N; i++) {
      inst.getMatrixAt(i, m); m.decompose(p, q, s);
      p.y += s.y + 0.6; s.set(1, 1, 1); m.compose(p, q, s); lamps.setMatrixAt(i, m);
    }
    this.root.add(lamps);
  }

  // ---- ギミック ----
  // 動く床（エレベーター・移動足場）。path(t) が「底面の中心」の位置を返す
  addMover(w, h, d, mat, path, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(geo, w, h, d); geo.translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (opts.trim) {
      const tg = [];
      for (const [px, pz, pw, pd] of [[0, -d / 2, w, 0.08], [0, d / 2, w, 0.08], [-w / 2, 0, 0.08, d], [w / 2, 0, 0.08, d]]) {
        const g = new THREE.BoxGeometry(pw + 0.03, 0.08, pd + 0.03); g.translate(px, h - 0.04, pz); tg.push(g);
      }
      mesh.add(new THREE.Mesh(mergeGeometries(tg), this.trimMats[opts.trim]));
    }
    this.root.add(mesh);
    const col = { min: [0, 0, 0], max: [0, 0, 0], mover: true };
    this.colliders.push(col);
    const mv = { mesh, col, w, h, d, path, pos: new THREE.Vector3() };
    const p0 = path(0);
    mv.pos.set(p0[0], p0[1], p0[2]);
    this.placeMover(mv);
    this.movers.push(mv);
    return mv;
  }

  placeMover(mv) {
    const p = mv.pos;
    mv.mesh.position.copy(p);
    mv.col.min = [p.x - mv.w / 2, p.y, p.z - mv.d / 2];
    mv.col.max = [p.x + mv.w / 2, p.y + mv.h, p.z + mv.d / 2];
  }

  bodies() {
    const g = this.game, out = [];
    if (g.player && g.player.body) out.push(g.player.body);
    if (g.enemies) for (const e of g.enemies.list) if (e.alive && !e.T.fly && !e.T.static) out.push(e.body);
    return out;
  }

  updateMovers(t) {
    if (!this.movers.length) return;
    const bodies = this.bodies();
    const np = new THREE.Vector3(), dl = new THREE.Vector3();
    for (const mv of this.movers) {
      const q = mv.path(t);
      np.set(q[0], q[1], q[2]);
      dl.subVectors(np, mv.pos);
      if (dl.lengthSq() < 1e-10) continue;
      const top = mv.pos.y + mv.h, hw = mv.w / 2, hd = mv.d / 2;
      for (const b of bodies) {
        const on = Math.abs(b.pos.y - top) < 0.25 && b.pos.x > mv.pos.x - hw - b.r * 0.6 && b.pos.x < mv.pos.x + hw + b.r * 0.6
          && b.pos.z > mv.pos.z - hd - b.r * 0.6 && b.pos.z < mv.pos.z + hd + b.r * 0.6 && b.vel.y <= 0.5;
        if (on) { b.pos.x += dl.x; b.pos.z += dl.z; b.pos.y = top + dl.y + 0.001; }
      }
      mv.pos.copy(np);
      this.placeMover(mv);
    }
  }

  // 加速レーン：上に乗ると dir の向きに一気に加速する
  addBoost(x, z, w, d, dx, dz, y = 0) {
    const tex = canvasTex(64, 128, (g, cw, ch) => {
      g.clearRect(0, 0, cw, ch);
      g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.lineCap = 'round';
      for (const oy of [20, 84]) { g.beginPath(); g.moveTo(10, oy + 30); g.lineTo(32, oy); g.lineTo(54, oy + 30); g.stroke(); }
    });
    const len = Math.abs(dx) > 0.5 ? w : d, wid = Math.abs(dx) > 0.5 ? d : w;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(Math.max(1, Math.round(wid / 2)), len / 4);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(NEON.cyan).multiplyScalar(1.6), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.z = Math.atan2(dx, -dz) + Math.PI;
    plane.position.set(x, y + 0.03, z);
    this.root.add(plane);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(wid + 0.4, len + 0.4), new THREE.MeshBasicMaterial({ color: 0x06121a, transparent: true, opacity: 0.7, depthWrite: false }));
    base.rotation.copy(plane.rotation); base.position.set(x, y + 0.02, z);
    this.root.add(base);
    this.boosts.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y, dir: new THREE.Vector3(dx, 0, dz).normalize(), tex });
  }

  // レーザーゲート：一定時間ごとに点いたり消えたりする光の壁。axis='x' なら x 方向に伸びる
  addLaser(x, z, len, axis, opts = {}) {
    const y0 = opts.y0 ?? 0.2, y1 = opts.y1 ?? 3.4;
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    if (axis === 'z') grp.rotation.y = Math.PI / 2;
    const postMat = this.matDark;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, y1 + 0.4, 0.5), postMat);
      post.position.set(sx * (len / 2 + 0.25), (y1 + 0.4) / 2, 0); post.castShadow = true;
      grp.add(post);
    }
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.2).multiplyScalar(2.2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beams = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.04), mat);
      b.position.y = y0 + (y1 - y0) * (k / 5);
      beams.add(b);
    }
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(len, y1 - y0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.2), transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    sheet.position.y = (y0 + y1) / 2;
    beams.add(sheet);
    grp.add(beams);
    this.root.add(grp);
    const hx = axis === 'z' ? 0.35 : len / 2, hz = axis === 'z' ? len / 2 : 0.35;
    // 柱は当たり判定あり
    for (const sx of [-1, 1]) {
      const px = axis === 'z' ? x : x + sx * (len / 2 + 0.25), pz = axis === 'z' ? z + sx * (len / 2 + 0.25) : z;
      this.addCollider(px - 0.25, 0, pz - 0.25, px + 0.25, y1 + 0.4, pz + 0.25);
    }
    this.lasers.push({ kind: 'gate', x, z, hx, hz, y0, y1, on: opts.on ?? 2.2, off: opts.off ?? 1.6, phase: opts.phase ?? 0, beams, mat, active: true, cd: 0 });
  }

  // 回転するレーザーの腕：低い位置をぐるっと回るので、ジャンプでかわす
  addSweeper(x, z, len, opts = {}) {
    const y = opts.y ?? 0.7, speed = opts.speed ?? 0.9;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 1.4, 16), this.matDark);
    hub.position.set(x, 0.7, z); hub.castShadow = true;
    this.root.add(hub);
    this.addCollider(x - 1, 0, z - 1, x + 1, 1.4, z + 1);
    const arm = new THREE.Group(); arm.position.set(x, y, z);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.15, 0.25).multiplyScalar(2.6) });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 8), mat);
    beam.rotation.z = Math.PI / 2; beam.position.x = len / 2 + 1.2;
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.2), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.z = Math.PI / 2; glow.position.x = len / 2 + 1.2;
    arm.add(beam, glow);
    this.root.add(arm);
    this.lasers.push({ kind: 'sweep', x, z, len: len + 1.2, y, speed, arm, cd: 0, a: opts.phase ?? 0 });
  }

  // 爆発するドラム缶：撃つと爆発し、近くのドラム缶も連鎖する
  addBarrel(x, z, y = 0) {
    if (!this.barrelMat) {
      const tex = canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#b3261e'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffcf33';
        for (let i = -2; i < 8; i++) { g.beginPath(); g.moveTo(i * 24, 40); g.lineTo(i * 24 + 12, 40); g.lineTo(i * 24 + 28, 60); g.lineTo(i * 24 + 16, 60); g.fill(); }
        g.fillStyle = '#1a1a1a'; g.fillRect(0, 36, w, 3); g.fillRect(0, 60, w, 3);
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      });
      this.barrelMat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.5, roughness: 0.45 });
      this.barrelTop = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7, roughness: 0.4 });
    }
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.25, 18), [this.barrelMat, this.barrelTop, this.barrelTop]);
    mesh.position.set(x, y + 0.625, z); mesh.castShadow = true; mesh.receiveShadow = true;
    this.root.add(mesh);
    const col = { min: [x - 0.48, y, z - 0.48], max: [x + 0.48, y + 1.25, z + 0.48], barrel: null };
    this.colliders.push(col);
    const b = { pos: new THREE.Vector3(x, y, z), mesh, col, alive: true, respawn: 0 };
    col.barrel = b;
    this.barrels.push(b);
    return b;
  }

  blowBarrel(b, owner = 'player') {
    if (!b.alive) return;
    b.alive = false; b.respawn = 28;
    b.mesh.visible = false;
    b.saved = [b.col.min, b.col.max];
    b.col.min = [1e6, 1e6, 1e6]; b.col.max = [1e6, 1e6, 1e6];
    const c = b.pos.clone(); c.y += 0.7;
    this.game.combat.explode(c, 6.5, 150, owner === 'echo' ? 'echo' : 'player', 0xff7a2a, { barrel: true });
    this.game.emit && this.game.emit('barrel');
  }

  // 爆発の近くにあるドラム缶を少し遅れて連鎖させる
  blastBarrels(pos, radius, owner) {
    for (const b of this.barrels) {
      if (!b.alive || b.queued) continue;
      if (b.pos.distanceTo(pos) < radius + 0.6) { b.queued = true; this.pendingBlasts.push({ b, t: 0.12 + Math.random() * 0.1, owner }); }
    }
  }

  updateGimmicks(dt, t) {
    const g = this.game, p = g.player;
    // 連鎖爆発
    for (let i = this.pendingBlasts.length - 1; i >= 0; i--) {
      const q = this.pendingBlasts[i];
      q.t -= dt;
      if (q.t <= 0) { this.pendingBlasts.splice(i, 1); q.b.queued = false; this.blowBarrel(q.b, q.owner); }
    }
    for (const b of this.barrels) {
      if (b.alive) continue;
      b.respawn -= dt;
      if (b.respawn <= 0 && this.free(b.pos.x, b.pos.y, b.pos.z, 0.6, 1.3)) {
        b.alive = true; b.mesh.visible = true; [b.col.min, b.col.max] = b.saved;
      }
    }
    if (!p || !p.body) return;
    const pb = p.body;
    // 加速レーン
    let inBoost = false;
    for (const bo of this.boosts) {
      bo.tex.offset.y -= dt * 2.2;
      if (pb.pos.x > bo.x0 && pb.pos.x < bo.x1 && pb.pos.z > bo.z0 && pb.pos.z < bo.z1 && Math.abs(pb.pos.y - bo.y) < 0.4 && p.alive) {
        inBoost = true;
        const vd = pb.vel.x * bo.dir.x + pb.vel.z * bo.dir.z;
        const want = 30;
        if (vd < want) { const k = Math.min(1, 10 * dt) * (want - vd); pb.vel.x += bo.dir.x * k; pb.vel.z += bo.dir.z * k; }
      }
    }
    if (inBoost && !this.wasBoost) { g.audio.play('dash', 0.7); g.player.fovKick = Math.max(g.player.fovKick || 0, 8); }
    this.wasBoost = inBoost;
    // レーザー
    for (const L of this.lasers) {
      L.cd = Math.max(0, L.cd - dt);
      if (L.kind === 'gate') {
        const cyc = L.on + L.off, ph = (t + L.phase) % cyc;
        const active = ph < L.on;
        const warn = !active && ph > cyc - 0.45;
        L.beams.visible = active || (warn && Math.floor(t * 16) % 2 === 0);
        L.mat.opacity = active ? 0.45 + Math.sin(t * 40) * 0.12 : 0.25;
        if (active && L.cd <= 0 && p.alive && Math.abs(pb.pos.x - L.x) < L.hx + pb.r && Math.abs(pb.pos.z - L.z) < L.hz + pb.r && pb.pos.y < L.y1 && pb.pos.y + pb.h > L.y0) {
          L.cd = 0.6;
          p.takeDamage(18, new THREE.Vector3(L.x, pb.pos.y + 1, L.z));
          const away = new THREE.Vector3(pb.pos.x - L.x, 0, pb.pos.z - L.z);
          if (L.hx > L.hz) away.set(0, 0, Math.sign(away.z) || 1); else away.set(Math.sign(away.x) || 1, 0, 0);
          pb.vel.addScaledVector(away, 9); pb.vel.y = Math.max(pb.vel.y, 4);
          g.effects.sparks(pb.pos.clone().setY(pb.pos.y + 1), away, 0xff3344, 14, 8);
        }
      } else {
        L.a += dt * L.speed;
        L.arm.rotation.y = -L.a;
        const cx = Math.cos(L.a), cz = Math.sin(L.a);
        const rx = pb.pos.x - L.x, rz = pb.pos.z - L.z;
        const along = rx * cx + rz * cz, perp = Math.abs(-rx * cz + rz * cx);
        if (L.cd <= 0 && p.alive && along > 0.5 && along < L.len && perp < 0.45 + pb.r && pb.pos.y < L.y + 0.15) {
          L.cd = 0.8;
          p.takeDamage(22, new THREE.Vector3(L.x + cx * along, L.y, L.z + cz * along));
          pb.vel.y = 7; pb.vel.x += -cz * 6; pb.vel.z += cx * 6;
          g.effects.sparks(pb.pos.clone().setY(L.y), new THREE.Vector3(0, 1, 0), 0xff3344, 18, 9);
        }
      }
    }
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    if (this.skyMat) this.skyMat.uniforms.uTime.value = t;
    for (const f of this.anim) f(t);
    this.updateMovers(t);
    this.updateGimmicks(dt, t);
    for (const p of this.pads) {
      const k = (t * 1.4 + p.pos.x * 0.1) % 1;
      p.ring.scale.setScalar(0.7 + k * 0.5);
      p.ring.material.opacity = 1 - k;
      p.beam.material.opacity = 0.12 + Math.sin(t * 4) * 0.05;
      p.arrow.position.y = 0.4 + ((t * 1.5) % 1) * 1.6;
    }
    if (this.coreLight) this.coreLight.intensity = 10 + Math.sin(t * 2.6) * 2.5;
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
    let best = maxDist, nAxis = -1, nSign = 0, bestCol = null;
    if (d.y < -1e-6 && !this.noFloor) { const t = -o.y / d.y; if (t >= 0 && t < best) { best = t; nAxis = 1; nSign = 1; } }
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
      if (ok && axis >= 0 && tmin < best) { best = tmin; nAxis = axis; nSign = sign; bestCol = c; }
    }
    if (nAxis < 0) return null;
    const normal = new THREE.Vector3();
    normal.setComponent(nAxis, nSign);
    return { dist: best, point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best), normal, col: bestCol };
  }

  los(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 0.01) return true;
    d.divideScalar(len);
    return !this.raycast(a, d, len - 0.3);
  }
}
