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
    if (holo) {
      m = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: col, emissiveIntensity: name === 'Main' ? 1.5 : name === 'Black' ? 2.2 : 0.7,
        transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
      });
    } else if (name === 'Main') {
      m = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.5), metalness: 0.45, roughness: 0.45 });
    } else if (name === 'Black') {
      m = new THREE.MeshStandardMaterial({ color: 0x050507, emissive: col, emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.3 });
    } else {
      m = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.85, roughness: 0.32 });
    }
    const d = this.game.world.detail;
    if (d && !holo && name !== 'Black') { m.roughnessMap = d.arm; m.normalMap = d.normal; m.normalScale.set(0.4, 0.4); }
    this.mats.set(key, m);
    return m;
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
