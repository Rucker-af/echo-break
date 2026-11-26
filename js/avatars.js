// アバター：人型キャラ「Adventurer」（Quaternius / CC0）を、キャラごとの服の色・体格・装備で作り分ける
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const HEIGHT = { vector: 1.84, haken: 1.76, nox: 1.86, boulder: 1.98 };
const WIDTH = { boulder: 1.16, haken: 0.95 };
// 髪と肌の色（キャラの個性）
const LOOK = {
  vector: { hair: 0x2a2018, skin: 0xc9a27e },
  haken: { hair: 0xd9d6cf, skin: 0xe0b896 },
  nox: { hair: 0x14161c, skin: 0xb88d68 },
  boulder: { hair: 0x5a3a22, skin: 0x8d6446 },
};
// ゲーム内で使うアニメ名 → モデルのアニメ名
const ALIAS = { Idle: 'Idle_Gun_Pointing', Relax: 'Idle_Gun', Running: 'Run_Shoot', Walking: 'Walk', Jump: 'Run_Shoot', Wave: 'Wave', Shoot: 'Idle_Gun_Shoot', Death: 'Death' };

export class Avatars {
  constructor(game) {
    this.game = game;
    this.mats = new Map();
    this.ready = this.load().catch((e) => { console.warn('avatar load failed', e); this.src = null; });
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync('assets/models/HumanAdventurer.glb');
    this.src = gltf.scene;
    this.clips = gltf.animations.map((c) => { c.name = c.name.split('|').pop(); return c; });
    this.height = 1.82;
    // 銃を構えたポーズのときの手首の位置（銃を持たせるのに使う）
    this.src.traverse((o) => { if (o.name.startsWith('Backpack')) o.visible = false; });
  }

  // name：モデルの元の材質名、または 'Main' 'Grey' 'Glow' 'Cloth' 'Suit'（装備や一人称の腕で使う）
  material(name, char, holo) {
    const key = `${char.id}:${name}:${holo ? 1 : 0}`;
    if (this.mats.has(key)) return this.mats.get(key);
    const col = new THREE.Color(char.color);
    const look = LOOK[char.id] || LOOK.vector;
    let m;
    const role = { Green: 'Main', LightGreen: 'Main2', Brown: 'Suit', Brown2: 'Suit2', Gold: 'Glow', Black: 'Black', Grey: 'Grey' }[name] || name;
    if (role === 'Glow') {
      m = holo
        ? new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
        : new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.35) });
    } else if (holo) {
      // 影：黒いシルエットに、キャラの色のふちどりが光る
      m = new THREE.MeshStandardMaterial({ color: 0x06040c, roughness: 1, metalness: 0, transparent: true, opacity: 0.86 });
      const rimCol = col.clone().multiplyScalar(role === 'Main' || role === 'Main2' ? 2.6 : 1.8);
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uRim = { value: rimCol };
        sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n  float rimF = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);\n  totalEmissiveRadiance += uRim * rimF;');
      };
      m.customProgramCacheKey = () => 'shadowrim';
    } else if (role === 'Main') {
      m = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.55).lerp(new THREE.Color(0x2a2d36), 0.25), metalness: 0.15, roughness: 0.65 });
    } else if (role === 'Main2') {
      m = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.8).lerp(new THREE.Color(0xdde2ea), 0.2), metalness: 0.1, roughness: 0.6 });
    } else if (role === 'Suit' || role === 'Suit2') {
      m = new THREE.MeshStandardMaterial({ color: role === 'Suit' ? 0x2b2f38 : 0x3a404c, metalness: 0.1, roughness: 0.8 });
    } else if (role === 'Cloth') {
      m = new THREE.MeshStandardMaterial({ color: 0x1b1d26, roughness: 0.95, metalness: 0.05, side: THREE.DoubleSide });
    } else if (role === 'Skin') {
      m = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7, metalness: 0 });
    } else if (role === 'Hair' || role === 'Eyebrows') {
      m = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.8 });
    } else if (role === 'Eye') {
      m = new THREE.MeshStandardMaterial({ color: 0x15110d, roughness: 0.3 });
    } else if (role === 'Black') {
      m = new THREE.MeshStandardMaterial({ color: 0x15161b, metalness: 0.2, roughness: 0.6 });
    } else {
      m = new THREE.MeshStandardMaterial({ color: 0x4a505c, metalness: 0.6, roughness: 0.45 });
    }
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
  decorate(model, root, char, holo, mixer, actions) {
    const M = (n) => this.material(n, char, holo);
    const k = 1;
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
    // 体の装備は基本の姿勢で付ける
    for (const bone of ['Torso', 'Chest', 'Head', 'Neck', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR', 'Hips']) {
      this.attach(model, root, bone, k, (h) => this[`gear_${char.id}`]?.(h, bone, add, B, C, M));
    }
    // 銃は「構えたポーズ」で手首に付ける（前を向くように）
    const aim = actions.Run_Shoot || actions.Idle_Gun;
    if (aim) {
      aim.reset().play(); mixer.update(0.05);
      this.attach(model, root, 'WristR', k, (h) => this.gun(h, char, add, B, C, M));
      aim.stop(); mixer.update(0);
    }
  }

  gun(h, char, add, B, C, M) {
    const big = char.id === 'boulder', long = char.id === 'nox';
    const L = long ? 0.75 : big ? 0.62 : 0.5;
    add(h, B(big ? 0.09 : 0.06, big ? 0.12 : 0.09, L), M('Black'), 0, 0.03, -L / 2 + 0.06);
    add(h, B(0.062, 0.012, L * 0.8), M('Glow'), 0, 0.08, -L / 2 + 0.04);
    add(h, C(0.016, 0.016, 0.2, 8), M('Grey'), 0, 0.04, -L + 0.02, Math.PI / 2);
    add(h, B(0.04, 0.1, 0.05), M('Black'), 0, -0.04, 0.0);
    if (long) add(h, C(0.03, 0.03, 0.18, 10), M('Grey'), 0, 0.12, -0.22, Math.PI / 2);
    if (big) add(h, C(0.07, 0.07, 0.12, 12), M('Grey'), 0, 0.03, -L + 0.02, Math.PI / 2);
  }

  // VECTOR（突撃）：光るタクティカルバイザー、胸当て、背中のブースター、肩パッド
  gear_vector(h, bone, add, B, C, M) {
    if (bone === 'Head') {
      add(h, new THREE.SphereGeometry(0.155, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M('Main'), 0, 0.12, 0.01);
      add(h, B(0.25, 0.05, 0.06), M('Glow'), 0, 0.125, -0.115);
      add(h, B(0.03, 0.08, 0.16), M('Grey'), 0.15, 0.1, 0);
    }
    if (bone === 'Chest') {
      add(h, B(0.34, 0.26, 0.07), M('Main'), 0, 0.05, -0.12);
      add(h, B(0.2, 0.02, 0.02), M('Glow'), 0, 0.1, -0.16);
      add(h, B(0.3, 0.3, 0.12), M('Grey'), 0, 0.03, 0.17);
      for (const sx of [-1, 1]) {
        add(h, C(0.045, 0.06, 0.2), M('Grey'), sx * 0.1, -0.08, 0.22);
        add(h, C(0.04, 0.04, 0.02), M('Glow'), sx * 0.1, -0.19, 0.22);
      }
    }
    if (bone === 'UpperArmL' || bone === 'UpperArmR') {
      const sx = bone === 'UpperArmL' ? -1 : 1;
      add(h, B(0.13, 0.06, 0.15), M('Main'), sx * 0.03, 0.06, 0, 0, 0, sx * -0.3);
      add(h, B(0.11, 0.012, 0.13), M('Glow'), sx * 0.035, 0.095, 0, 0, 0, sx * -0.3);
    }
  }

  // HAKEN（機動）：ゴーグル、長いマフラー、右腕のフック発射機
  gear_haken(h, bone, add, B, C, M) {
    if (bone === 'Head') {
      for (const sx of [-1, 1]) {
        add(h, C(0.04, 0.04, 0.04, 16), M('Grey'), sx * 0.055, 0.135, -0.115, Math.PI / 2);
        add(h, C(0.03, 0.03, 0.01, 16), M('Glow'), sx * 0.055, 0.135, -0.14, Math.PI / 2);
      }
      add(h, B(0.3, 0.02, 0.24), M('Cloth'), 0, 0.14, 0.0);
    }
    if (bone === 'Neck') {
      add(h, new THREE.TorusGeometry(0.085, 0.035, 8, 20), M('Main'), 0, -0.02, 0, Math.PI / 2);
      add(h, B(0.07, 0.015, 0.4), M('Main'), 0.04, -0.1, 0.26, -0.7, 0.15);
      add(h, B(0.06, 0.015, 0.32), M('Main'), -0.04, -0.12, 0.22, -0.85, -0.2);
    }
    if (bone === 'LowerArmR') {
      add(h, B(0.08, 0.2, 0.08), M('Grey'), 0.03, -0.1, -0.01);
      add(h, C(0.025, 0.025, 0.06), M('Main'), 0.03, -0.23, -0.01);
      add(h, B(0.012, 0.16, 0.06), M('Glow'), 0.075, -0.1, -0.01);
    }
  }

  // NOX（狙撃）：フードとマント、片目のスコープ、背中のアンテナ
  gear_nox(h, bone, add, B, C, M) {
    if (bone === 'Head') {
      const hood = new THREE.SphereGeometry(0.175, 22, 14, 0, Math.PI, 0, Math.PI * 0.62);
      add(h, hood, M('Cloth'), 0, 0.11, 0.01, -0.25);
      add(h, C(0.035, 0.04, 0.07, 16), M('Grey'), 0.055, 0.13, -0.13, Math.PI / 2);
      add(h, C(0.028, 0.028, 0.01, 16), M('Glow'), 0.055, 0.13, -0.168, Math.PI / 2);
    }
    if (bone === 'Chest') {
      add(h, B(0.38, 0.75, 0.02), M('Cloth'), 0, -0.22, 0.16, 0.1);
      add(h, B(0.38, 0.015, 0.03), M('Glow'), 0, -0.58, 0.2, 0.1);
      add(h, C(0.008, 0.008, 0.45, 6), M('Grey'), 0.13, 0.28, 0.14, 0, 0, 0.15);
      add(h, new THREE.SphereGeometry(0.018, 8, 6), M('Glow'), 0.1, 0.5, 0.14);
    }
    if (bone === 'UpperArmL') add(h, B(0.09, 0.08, 0.02), M('Glow'), -0.04, -0.02, -0.06);
  }

  // BOULDER（重装）：重いヘルメット、厚い胸の装甲、大きな肩当て、左腕の盾
  gear_boulder(h, bone, add, B, C, M) {
    if (bone === 'Head') {
      // 顔は出した重いヘルメット（上と後ろとほおをおおう）
      add(h, new THREE.SphereGeometry(0.17, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), M('Main'), 0, 0.12, 0.02);
      for (const sx of [-1, 1]) add(h, B(0.04, 0.14, 0.16), M('Main'), sx * 0.15, 0.08, 0.0);
      add(h, B(0.26, 0.035, 0.05), M('Glow'), 0, 0.2, -0.13);
      add(h, B(0.05, 0.05, 0.28), M('Grey'), 0, 0.29, 0.02);
    }
    if (bone === 'Chest') {
      add(h, B(0.42, 0.34, 0.32), M('Main'), 0, 0.03, 0.0);
      add(h, B(0.26, 0.02, 0.02), M('Glow'), 0, 0.08, -0.17);
      add(h, B(0.36, 0.3, 0.12), M('Grey'), 0, 0.02, 0.2);
    }
    if (bone === 'UpperArmL' || bone === 'UpperArmR') {
      const sx = bone === 'UpperArmL' ? -1 : 1;
      add(h, B(0.2, 0.1, 0.22), M('Main'), sx * 0.05, 0.06, 0, 0, 0, sx * -0.25);
      add(h, B(0.16, 0.015, 0.18), M('Grey'), sx * 0.06, 0.115, 0, 0, 0, sx * -0.25);
    }
    if (bone === 'LowerArmL') {
      add(h, B(0.04, 0.42, 0.3), M('Main'), -0.07, -0.1, 0);
      add(h, B(0.01, 0.36, 0.24), M('Glow'), -0.093, -0.1, 0);
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
    const holo = !!opts.holo;
    const model = skeletonClone(this.src);
    const s = (HEIGHT[char.id] || 1.85) / this.height;
    const w = WIDTH[char.id] || 1;
    model.scale.set(s * w, s, s * w);
    model.rotation.y = Math.PI; // モデルは +Z 向きなので反転
    model.traverse((o) => {
      if (o.isMesh) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        const mapped = list.map((mt) => this.material(mt.name, char, holo));
        o.material = Array.isArray(o.material) ? mapped : mapped[0];
        o.castShadow = !holo;
        o.frustumCulled = false;
        if (holo) o.renderOrder = 6;
      }
    });
    const root = new THREE.Group();
    root.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const c of this.clips) actions[c.name] = mixer.clipAction(c);
    for (const [a, real] of Object.entries(ALIAS)) if (actions[real]) actions[a] = actions[real];
    this.decorate(model, root, char, holo, mixer, actions);
    const av = {
      root, mixer, actions, cur: null,
      play(name, fade = 0.2, once = false) {
        const next = actions[name];
        if (!next || (av.cur === name && !once)) return;
        next.reset();
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        next.fadeIn(fade).play();
        if (av.cur && actions[av.cur] && actions[av.cur] !== next) actions[av.cur].fadeOut(fade);
        av.cur = name;
      },
    };
    av.play('Idle', 0);
    return av;
  }
}
