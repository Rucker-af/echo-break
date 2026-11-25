// アバター：RobotExpressive（Quaternius / CC0）をキャラごとの色と体格で使う
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const HEIGHT = { vector: 1.85, haken: 1.75, nox: 1.85, boulder: 2.15 };
const WIDTH = { boulder: 1.18, haken: 0.92 };

export class Avatars {
  constructor(game) {
    this.game = game;
    this.mats = new Map();
    this.ready = this.load().catch((e) => { console.warn('avatar load failed', e); this.src = null; });
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync('assets/models/RobotExpressive.glb');
    this.src = gltf.scene;
    this.clips = gltf.animations;
    const box = new THREE.Box3().setFromObject(this.src);
    this.height = box.max.y - box.min.y;
  }

  material(name, char, holo) {
    const key = `${char.id}:${name}:${holo ? 1 : 0}`;
    if (this.mats.has(key)) return this.mats.get(key);
    const col = new THREE.Color(char.color);
    let m;
    if (name === 'Glow') {
      m = holo
        ? new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
        : new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.35) });
      this.mats.set(key, m);
      return m;
    }
    if (name === 'Cloth' && !holo) {
      m = new THREE.MeshStandardMaterial({ color: 0x1b1d26, roughness: 0.95, metalness: 0.05, side: THREE.DoubleSide });
      this.mats.set(key, m);
      return m;
    }
    if (holo) {
      m = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: col, emissiveIntensity: name === 'Main' ? 1.5 : name === 'Black' ? 2.2 : 0.7,
        transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
      });
    } else if (name === 'Main') {
      m = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.5), metalness: 0.3, roughness: 0.6 });
    } else if (name === 'Black') {
      m = new THREE.MeshStandardMaterial({ color: 0x050507, emissive: col, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.5 });
    } else {
      m = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.6, roughness: 0.55 });
    }
    const d = this.game.world.detail;
    if (d && !holo && name !== 'Black') { m.roughnessMap = d.arm; m.normalMap = d.normal; m.normalScale.set(0.4, 0.4); }
    this.mats.set(key, m);
    return m;
  }

  // ボーンに部品を付ける。build には「ボーンの位置を原点、前が -Z・上が +Y・右が +X（メートル）」で部品を置く
  attach(model, root, boneName, k, build) {
    const bone = model.getObjectByName(boneName);
    if (!bone) return;
    root.updateMatrixWorld(true);
    const p = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
    const want = new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(k, k, k));
    const local = bone.matrixWorld.clone().invert().multiply(want);
    const holder = new THREE.Group();
    local.decompose(holder.position, holder.quaternion, holder.scale);
    bone.add(holder);
    build(holder);
  }

  // キャラごとの装備（スキルに合わせた見た目）
  decorate(model, root, char, holo) {
    const M = (n) => this.material(n, char, holo);
    const k = (HEIGHT[char.id] || 1.85) / 1.85;
    const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      m.castShadow = !holo; m.frustumCulled = false;
      if (holo) m.renderOrder = 6;
      parent.add(m);
      return m;
    };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const C = (r1, r2, h, n = 14) => new THREE.CylinderGeometry(r1, r2, h, n);
    const A = (n) => this.attach(model, root, n, k, (h) => this[`gear_${char.id}`]?.(h, n, add, B, C, M));
    for (const bone of ['Torso_1', 'Head', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR', 'Neck', 'Hips']) A(bone);
  }

  // VECTOR：背中のブースター、肩アーマー、横長バイザー
  gear_vector(h, bone, add, B, C, M) {
    if (bone === 'Torso_1') {
      add(h, B(0.48, 0.42, 0.16), M('Grey'), 0, 0.1, 0.34);
      add(h, B(0.5, 0.06, 0.18), M('Main'), 0, 0.33, 0.34);
      for (const sx of [-1, 1]) {
        add(h, C(0.08, 0.1, 0.36), M('Grey'), sx * 0.17, -0.02, 0.44);
        add(h, C(0.07, 0.07, 0.03), M('Glow'), sx * 0.17, -0.21, 0.44);
        add(h, B(0.04, 0.3, 0.22), M('Main'), sx * 0.3, 0.12, 0.38, 0, 0, sx * 0.2);
      }
    }
    if (bone === 'UpperArmL' || bone === 'UpperArmR') {
      const sx = bone === 'UpperArmL' ? -1 : 1;
      add(h, B(0.24, 0.1, 0.3), M('Main'), sx * 0.06, 0.1, 0, 0, 0, sx * -0.35);
      add(h, B(0.2, 0.02, 0.26), M('Glow'), sx * 0.07, 0.16, 0, 0, 0, sx * -0.35);
    }
    if (bone === 'Head') {
      add(h, B(1.02, 0.1, 0.06), M('Glow'), 0, 0.33, -0.62);
      add(h, B(0.06, 0.26, 0.5), M('Main'), 0, 0.78, 0.05);
    }
  }

  // HAKEN：右腕のフック発射機、マフラー、ゴーグル
  gear_haken(h, bone, add, B, C, M) {
    if (bone === 'LowerArmR') {
      add(h, B(0.15, 0.15, 0.36), M('Grey'), 0.06, -0.1, -0.1);
      add(h, C(0.05, 0.05, 0.12), M('Main'), 0.06, -0.1, -0.33, Math.PI / 2);
      for (const a of [-0.5, 0.5]) add(h, B(0.03, 0.03, 0.12), M('Glow'), 0.06 + a * 0.1, -0.1, -0.42, 0, a, 0);
      add(h, B(0.02, 0.17, 0.3), M('Glow'), 0.14, -0.1, -0.1);
    }
    if (bone === 'Neck') {
      const scarf = new THREE.TorusGeometry(0.3, 0.075, 8, 24);
      add(h, scarf, M('Cloth'), 0, 0.02, 0, Math.PI / 2);
      add(h, B(0.14, 0.03, 0.62), M('Main'), 0.08, -0.1, 0.5, -0.55, 0.15);
      add(h, B(0.11, 0.03, 0.48), M('Main'), -0.08, -0.12, 0.44, -0.75, -0.2);
    }
    if (bone === 'Head') {
      for (const sx of [-1, 1]) {
        add(h, C(0.12, 0.12, 0.08, 18), M('Grey'), sx * 0.22, 0.34, -0.63, Math.PI / 2);
        add(h, C(0.09, 0.09, 0.02, 18), M('Glow'), sx * 0.22, 0.34, -0.68, Math.PI / 2);
      }
      add(h, B(0.9, 0.05, 0.05), M('Cloth'), 0, 0.34, -0.6);
    }
  }

  // NOX：大きなスコープ目、フード、背中の長いアンテナとマント
  gear_nox(h, bone, add, B, C, M) {
    if (bone === 'Head') {
      add(h, C(0.17, 0.2, 0.3, 20), M('Grey'), 0.2, 0.34, -0.7, Math.PI / 2);
      add(h, C(0.13, 0.13, 0.02, 20), M('Glow'), 0.2, 0.34, -0.86, Math.PI / 2);
      // フードは頭の後ろ半分と上だけをおおう
      const hood = new THREE.SphereGeometry(0.7, 24, 14, 0, Math.PI, 0, Math.PI * 0.62);
      add(h, hood, M('Cloth'), 0, 0.32, 0.06, -0.2);
      add(h, C(0.015, 0.015, 0.7, 6), M('Grey'), -0.35, 0.95, 0.2, 0, 0, 0.3);
      add(h, new THREE.SphereGeometry(0.04, 10, 8), M('Glow'), -0.46, 1.28, 0.2);
    }
    if (bone === 'Torso_1') {
      add(h, B(0.62, 0.95, 0.03), M('Cloth'), 0, -0.2, 0.33, 0.12);
      add(h, B(0.62, 0.03, 0.04), M('Glow'), 0, -0.66, 0.39, 0.12);
      add(h, C(0.03, 0.03, 0.4, 8), M('Grey'), 0.22, 0.22, 0.32);
    }
    if (bone === 'UpperArmL') {
      add(h, B(0.16, 0.14, 0.04), M('Glow'), -0.08, -0.02, -0.12);
    }
  }

  // BOULDER：分厚い装甲、左腕の大盾、ヘルメット
  gear_boulder(h, bone, add, B, C, M) {
    if (bone === 'Torso_1') {
      add(h, B(0.72, 0.48, 0.14), M('Main'), 0, 0.12, -0.3);
      add(h, B(0.5, 0.05, 0.02), M('Glow'), 0, 0.18, -0.38);
      add(h, B(0.68, 0.55, 0.16), M('Grey'), 0, 0.1, 0.33);
      for (const sx of [-1, 1]) add(h, C(0.06, 0.06, 0.5), M('Main'), sx * 0.2, 0.12, 0.44);
    }
    if (bone === 'UpperArmL' || bone === 'UpperArmR') {
      const sx = bone === 'UpperArmL' ? -1 : 1;
      add(h, B(0.36, 0.2, 0.42), M('Main'), sx * 0.08, 0.1, 0, 0, 0, sx * -0.3);
      add(h, B(0.3, 0.03, 0.36), M('Grey'), sx * 0.1, 0.22, 0, 0, 0, sx * -0.3);
    }
    if (bone === 'LowerArmL') {
      add(h, B(0.08, 0.8, 0.6), M('Main'), -0.16, -0.12, -0.04);
      add(h, B(0.02, 0.72, 0.52), M('Glow'), -0.21, -0.12, -0.04);
      add(h, B(0.09, 0.1, 0.62), M('Grey'), -0.16, 0.26, -0.04);
    }
    if (bone === 'Head') {
      add(h, B(0.22, 0.14, 0.95), M('Main'), 0, 0.82, 0.02);
      for (const y of [0.24, 0.4]) add(h, B(0.9, 0.04, 0.05), M('Grey'), 0, y, -0.64);
    }
  }

  // カード用の写真を撮る（メインの描画面の左下を一瞬だけ使って画像にする）
  portrait(char, w = 160, h = 220) {
    if (!this.src) return null;
    const r = this.game.renderer;
    if (!this.pScene) {
      const sc = this.pScene = new THREE.Scene();
      sc.background = new THREE.Color(0x0c0c1c);
      sc.add(new THREE.HemisphereLight(0xbfd0ff, 0x221133, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 5); sc.add(key);
      this.pRim = new THREE.DirectionalLight(0xffffff, 2.5); this.pRim.position.set(-3, 3, -4); sc.add(this.pRim);
      this.pCam = new THREE.PerspectiveCamera(28, w / h, 0.1, 50);
    }
    this.pScene.environment = this.game.scene.environment;
    this.pRim.color.set(char.color);
    const av = this.create(char);
    av.mixer.update(0.8);
    av.root.rotation.y = Math.PI + 0.5;
    this.pScene.add(av.root);
    const H = HEIGHT[char.id] || 1.85;
    this.pCam.aspect = w / h; this.pCam.updateProjectionMatrix();
    this.pCam.position.set(0, H * 0.62, H * 2.55);
    this.pCam.lookAt(0, H * 0.52, 0);
    const pr = r.getPixelRatio();
    const size = r.getSize(new THREE.Vector2());
    r.setScissorTest(true);
    r.setViewport(0, 0, w, h); r.setScissor(0, 0, w, h);
    r.render(this.pScene, this.pCam);
    const c = document.createElement('canvas');
    c.width = Math.round(w * pr); c.height = Math.round(h * pr);
    c.getContext('2d').drawImage(r.domElement, 0, r.domElement.height - c.height, c.width, c.height, 0, 0, c.width, c.height);
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
    this.pScene.remove(av.root);
    return c.toDataURL('image/png');
  }

  // 1体作る。返り値の root を前（-Z）向きに置けば、ゲームの向きと一致する
  create(char, opts = {}) {
    if (!this.src) return null;
    const model = skeletonClone(this.src);
    const s = (HEIGHT[char.id] || 1.85) / this.height;
    const w = WIDTH[char.id] || 1;
    model.scale.set(s * w, s, s * w);
    model.rotation.y = Math.PI; // モデルは +Z 向きなので反転
    model.traverse((o) => {
      if (o.isMesh) {
        o.material = this.material(o.material.name, char, !!opts.holo);
        o.castShadow = !opts.holo;
        o.frustumCulled = false;
        if (opts.holo) o.renderOrder = 6;
      }
    });
    const root = new THREE.Group();
    root.add(model);
    this.decorate(model, root, char, !!opts.holo);
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const c of this.clips) actions[c.name] = mixer.clipAction(c);
    const av = {
      root, mixer, actions, cur: null,
      play(name, fade = 0.2, once = false) {
        const next = actions[name];
        if (!next || (av.cur === name && !once)) return;
        next.reset();
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        next.fadeIn(fade).play();
        if (av.cur && actions[av.cur] && av.cur !== name) actions[av.cur].fadeOut(fade);
        av.cur = name;
      },
    };
    av.play('Idle', 0);
    return av;
  }
}
