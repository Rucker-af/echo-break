// ECHO//BREAK — ゲーム全体をまとめる本体
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Input, DEFAULT_KEYS, ACTION_NAMES, keyLabel } from './input.js';
import { World } from './world.js';
import { Effects } from './effects.js';
import { EnemyManager } from './enemies.js';
import { Combat } from './combat.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS, unlockLevel } from './weapons.js';
import { MAPS } from './maps.js';
import { EchoSystem } from './echo.js';
import { UI } from './ui.js';
import { WaveMode, TutorialMode } from './modes.js';
import { AudioFX } from './audio.js';
import { damp, hex } from './utils.js';
import { CHARACTERS, TRAINEE, getCharacter } from './characters.js';
import { Avatars } from './avatars.js';
import { Profile } from './profile.js';

const DIFF = [
  { name: 'EASY', dmg: 0.5, rate: 0.7, acc: 1.7, hp: 0.8 },
  { name: 'NORMAL', dmg: 1, rate: 1, acc: 1, hp: 1 },
  { name: 'HARD', dmg: 1.4, rate: 1.3, acc: 0.6, hp: 1.15 },
];

function store(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* 保存できない環境 */ } }
function load(key, def) { try { const v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; } }

// 画面全体の仕上げ（カラーグレーディング）
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.38 }, uGrain: { value: 0.03 }, uCA: { value: 0.0022 },
    uSat: { value: 1.08 }, uCon: { value: 1.06 }, uTint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uCA, uSat, uCon; uniform vec3 uTint; varying vec2 vUv;
  void main(){
    vec2 d = vUv - 0.5; float r = dot(d, d);
    vec3 c;
    c.r = texture2D(tDiffuse, vUv + d * uCA * r * 4.0).r;
    c.g = texture2D(tDiffuse, vUv).g;
    c.b = texture2D(tDiffuse, vUv - d * uCA * r * 4.0).b;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, uSat);
    c = (c - 0.5) * uCon + 0.5;
    c *= uTint;
    c *= 1.0 - uVig * smoothstep(0.12, 0.7, r * 1.7);
    float n = fract(sin(dot(vUv * vec2(12.9898, 78.233) + uTime, vec2(1.0))) * 43758.5453);
    c += (n - 0.5) * uGrain;
    gl_FragColor = vec4(max(c, 0.0), 1.0);
  }`,
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.isTouch = matchMedia('(pointer: coarse)').matches || (('ontouchstart' in window) && navigator.maxTouchPoints > 0);
    document.body.classList.toggle('touch', this.isTouch);
    let saved = {};
    try { saved = JSON.parse(load('eb_settings', '{}')) || {}; } catch (e) { saved = {}; }
    this.settings = Object.assign({ sens: 1, fov: 75, volume: 0.7, quality: this.isTouch ? 'low' : 'high', adsMode: 'hold' }, saved);
    this.diffIndex = Number(load('eb_diff', '1')) || 1;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x160b28, 0.0048);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.03, 1500);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.time = 0; this.timeScale = 1; this.slowT = 0; this.trauma = 0;
    this.state = 'menu'; this.mode = null; this.menuT = 0;
    this.score = 0; this.combo = 0; this.comboT = 0; this.deathT = 0;
    this.stats = { shots: 0, hits: 0, kills: 0, heads: 0, echoKills: 0, wave: 0, bosses: 0 };
    this.diff = DIFF[1];
    this.enemySlowT = 0;
    this.charId = load('eb_char', 'vector');
    this.profile = new Profile();
    this.modeSel = load('eb_mode', 'wave');
    this.mapSel = load('eb_map', 'neon');

    this.audio = new AudioFX();
    this.audio.setVolume(this.settings.volume);
    this.input = new Input(this);
    this.input.setBindings(this.settings.keys || {});
    try { this.touchLayout = JSON.parse(load('eb_touch', '{}')) || {}; } catch (e) { this.touchLayout = {}; }
    this.effects = new Effects(this);
    this.world = new World(this);
    this.avatars = new Avatars(this);
    // キャラ選択用のライト（普段は0。数を変えるとシェーダーの作り直しが起きるので常に置く）
    this.showLight = new THREE.DirectionalLight(0xffffff, 0);
    this.showLight.position.set(2, 9, 9);
    this.showLight.target.position.set(0, 5.9, 0);
    this.scene.add(this.showLight, this.showLight.target);
    this.menuView = 'home';
    this.enemies = new EnemyManager(this);
    this.combat = new Combat(this);
    this.echo = new EchoSystem(this);
    this.player = new Player(this);
    this.weapons = new WeaponSystem(this);
    this.ui = new UI(this);
    this.waves = new WaveMode(this);
    this.tutorial = new TutorialMode(this);
    this.playerTarget = { pos: this.player.body.pos, chest: this.player.chest, vel: this.player.body.vel };

    this.applyQuality();
    this.bindDom();
    this.prewarm();
    this.weapons.root.visible = false;
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    const loadText = document.getElementById('loadText');
    if (loadText) loadText.textContent = 'LOADING TEXTURES…';
    Promise.race([Promise.all([this.world.ready, this.avatars.ready]), new Promise((r) => setTimeout(r, 9000))])
      .then(() => { this.applyDetail(); try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* 失敗しても続行 */ } })
      .then(() => setTimeout(() => { if (this.state === 'menu') this.enterLobby(); }, 200));
    this.refreshHome();
  }

  // ---- 画質 ----
  applyQuality() {
    const high = this.settings.quality === 'high';
    const pr = Math.min(devicePixelRatio || 1, high ? 1.75 : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    const wantShadows = high;
    if (this.renderer.shadowMap.enabled !== wantShadows) {
      this.renderer.shadowMap.enabled = wantShadows;
      this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
    }
    const w = Math.floor(innerWidth * pr), h = Math.floor(innerHeight * pr);
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
    if (this.composer) this.composer.dispose();
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(innerWidth, innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (high) {
      // 物の接地面・すき間の影（高画質のみ）
      this.ao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
      this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0 });
      this.ao.blendIntensity = 0.85;
      this.composer.addPass(this.ao);
    } else this.ao = null;
    const bres = high ? new THREE.Vector2(innerWidth, innerHeight) : new THREE.Vector2(innerWidth / 2, innerHeight / 2);
    this.bloom = new UnrealBloomPass(bres, 0.32, 0.3, 1.05);
    this.bloom.strength = this.world.cfg.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // 仕上げ：色味の調整・周辺を暗く・ふちの色ずれ・フィルムの粒
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);
    if (this.world.applyCfg) this.world.applyCfg();
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.effects.setScale(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  prewarm() {
    // 最初の出現時のカクつきを防ぐため、使うシェーダーを先に作っておく
    const types = ['trooper', 'drone', 'brute', 'dummy'];
    const es = types.map((t, i) => this.enemies.spawn(t, new THREE.Vector3(i * 3, 0, 40), { instant: true }));
    this.echo.mesh.visible = true;
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { console.warn(e); }
    this.echo.mesh.visible = false;
    this.enemies.clear();
    this.effects.clear();
  }

  // 銃と敵にも金属の凹凸・ざらつきを足す（色はそのまま）
  applyDetail() {
    const d = this.world.detail;
    if (!d || this.detailApplied) return;
    this.detailApplied = true;
    const mk = (t, rep) => { const c = t.clone(); c.repeat.set(rep, rep); c.needsUpdate = true; return c; };
    const nW = mk(d.normal, 0.6), aW = mk(d.arm, 0.6);
    const nE = mk(d.normal, 0.5), aE = mk(d.arm, 0.5);
    const touch = (mat, n, a, scale) => {
      if (!mat || !mat.isMeshStandardMaterial || mat.emissive.getHex() !== 0) return;
      if (n) { mat.normalMap = n; mat.normalScale.set(scale, scale); }
      mat.roughnessMap = a;
      mat.roughness = Math.min(1, mat.roughness * 1.6);
      mat.needsUpdate = true;
    };
    const seen = new Set();
    for (const m of this.weapons.models) m.group.traverse((o) => {
      if (o.isMesh && !seen.has(o.material)) {
        seen.add(o.material);
        // 手元の銃はカメラに近く、つるつるだと夜の写真の明るい点が映り込んで白飛びするので、ざらつかせる
        const mt = o.material;
        if (mt.isMeshStandardMaterial && mt.emissive.getHex() === 0) { mt.roughness = 0.62; mt.metalness = Math.min(mt.metalness, 0.6); mt.needsUpdate = true; }
      }
    });
    for (const t of ['trooper', 'drone', 'brute', 'dummy']) {
      const mats = this.enemies.mats(t);
      touch(mats.armor, nE, aE, 0.8); touch(mats.dark, nE, aE, 0.8);
    }
  }

  // ---- DOM ----
  bindDom() {
    const $ = (id) => document.getElementById(id);
    addEventListener('resize', () => { this.resize(); this.checkOrientation(); if (this.state === 'playing') this.applyTouchLayout(); });
    addEventListener('orientationchange', () => setTimeout(() => { this.resize(); this.checkOrientation(); }, 300));
    try { matchMedia('(orientation: portrait)').addEventListener('change', () => setTimeout(() => this.checkOrientation(), 100)); } catch (e) { /* 古いブラウザ */ }
    document.getElementById('btnRotateSkip').addEventListener('click', () => { this.rotateSkipped = true; this.checkOrientation(); });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.input.locked = locked;
      if (locked) {
        if (this.state === 'paused' && this.wantResume) this.resume();
      } else if (this.state === 'playing' && !this.isTouch) this.pause();
    });
    document.addEventListener('pointerlockerror', () => { this.ui.toast('もう一度クリックしてください'); });
    this.canvas.addEventListener('click', () => { if (this.state === 'playing' && !this.isTouch && !this.input.locked) this.requestLock(); });
    $('clickToPlay').addEventListener('click', () => this.requestLock());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing' && !this.noAutoPause) this.pause(); });

    const click = (id, fn) => $(id).addEventListener('click', () => { this.audio.init(); this.audio.play('ui'); fn(); });
    click('btnBattle', () => this.startMode(this.modeSel));
    click('btnChar', () => this.openCharSelect());
    click('btnCsBack', () => this.enterLobby());
    click('btnDeploy', () => this.enterLobby());
    document.querySelectorAll('#modeList .mode-card').forEach((b) => b.addEventListener('click', () => {
      if (b.disabled) return;
      this.modeSel = b.dataset.mode; store('eb_mode', this.modeSel);
      this.audio.init(); this.audio.play('ui'); this.refreshHome();
    }));
    document.querySelectorAll('#lbNav button').forEach((b) => b.addEventListener('click', () => {
      this.audio.init(); this.audio.play('ui');
      document.querySelectorAll('#lbNav button').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.lb-panel').forEach((pn) => pn.classList.toggle('on', pn.dataset.panel === b.dataset.tab));
      if (b.dataset.tab === 'missions') { this.missionsSeen = true; this.refreshHome(); }
      if (b.dataset.tab === 'loadout') { this.renderLoadout(); if (this.profile.newWeapons.length) { this.loadoutSeenNew = this.profile.newWeapons.slice(); this.profile.newWeapons = []; this.profile.save(); this.refreshHome(); } }
    }));
    click('btnSettings', () => { this.settingsBack = 'home'; this.openSettings(); });
    click('btnSettingsBack', () => this.ui.showScreen(this.settingsBack));
    click('btnResume', () => this.tryResume());
    click('btnPauseSettings', () => { this.settingsBack = 'pause'; this.openSettings(); });
    click('btnQuit', () => this.toHome());
    click('btnRetry', () => this.startMode(this.lastMode || 'wave'));
    click('btnHome', () => this.toHome());
    click('btnTutToBattle', () => { this.modeSel = 'wave'; store('eb_mode', 'wave'); this.toHome(); });
    click('btnTutHome', () => this.toHome());
    document.querySelectorAll('#mapSel button').forEach((b) => b.addEventListener('click', () => {
      this.mapSel = b.dataset.map; store('eb_map', this.mapSel);
      this.audio.init(); this.audio.play('ui'); this.refreshHome();
    }));
    document.querySelectorAll('#diffSel button').forEach((b) => b.addEventListener('click', () => {
      this.diffIndex = Number(b.dataset.d); store('eb_diff', String(this.diffIndex));
      this.audio.init(); this.audio.play('ui'); this.refreshHome();
    }));
    const bindRange = (id, vid, key, fmt) => {
      const el = $(id), v = $(vid);
      el.value = this.settings[key]; v.textContent = fmt(this.settings[key]);
      el.addEventListener('input', () => {
        this.settings[key] = Number(el.value); v.textContent = fmt(this.settings[key]);
        if (key === 'volume') this.audio.setVolume(this.settings.volume);
        if (key === 'fov') { this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix(); }
        this.saveSettings();
      });
    };
    bindRange('sSens', 'vSens', 'sens', (x) => x.toFixed(2));
    bindRange('sFov', 'vFov', 'fov', (x) => String(Math.round(x)));
    bindRange('sVol', 'vVol', 'volume', (x) => String(Math.round(x * 100)));
    document.querySelectorAll('#sQuality button').forEach((b) => b.addEventListener('click', () => {
      this.settings.quality = b.dataset.q; this.saveSettings(); this.applyQuality(); this.refreshSettings(); this.audio.play('ui');
      if (this.settings.quality === 'high') this.world.loadRealistic(true).then(() => this.applyDetail());
    }));
    document.querySelectorAll('#sAds button').forEach((b) => b.addEventListener('click', () => {
      this.settings.adsMode = b.dataset.m; this.input.adsToggle = false; this.saveSettings(); this.refreshSettings(); this.audio.play('ui');
    }));
    this.refreshSettings();
    // 操作説明
    this.refreshControls();
    // キー設定
    click('btnKeys', () => this.openKeys());
    click('btnKeysBack', () => this.ui.showScreen('settings'));
    click('btnKeysReset', () => { this.settings.keys = {}; this.input.setBindings({}); this.saveSettings(); this.renderKeys(); this.refreshControls(); });
    // ボタン配置
    click('btnTouchEdit', () => this.openTouchEditor());
    // 名前
    const nm = $('sName');
    nm.value = this.profile.name;
    nm.addEventListener('change', () => { this.profile.name = (nm.value.trim() || 'AGENT').slice(0, 12); this.profile.save(); this.refreshHome(); });
    nm.addEventListener('keydown', (e) => e.stopPropagation());
    this.checkOrientation();
  }

  refreshControls() {
    const K = (a) => keyLabel(this.input.bindings[a]);
    const pc = [[`${K('fwd')}${K('left')}${K('back')}${K('right')}`, '移動'], ['マウス', '視点'], ['左クリック', '射撃'], [`右クリック / ${K('ads')}`, 'エイム（ADS）'], [K('jump'), 'ジャンプ / 二段'], [K('dash'), 'ダッシュ'], [K('slide'), 'スライディング'], [K('grapple'), 'グラップルフック'], [K('shock'), 'スキル'], [K('echo'), 'ECHO 発動'], [K('ult'), '必殺技（ULT）'], [K('reload'), 'リロード'], [`${K('w1')} ${K('w2')} / ホイール`, '武器切替']];
    const tc = [['左スティック', '移動'], ['右側ドラッグ', '視点'], ['FIRE', '押したまま狙える'], ['ADS', 'エイム切替'], ['JUMP', 'ジャンプ / 二段'], ['DASH', 'ダッシュ'], ['SLIDE', 'スライディング'], ['HOOK', 'グラップル'], ['SHOCK', 'スキル'], ['ECHO', 'エコー発動'], ['ULT', '必殺技'], ['⇄', '武器切替']];
    document.getElementById('controlsList').innerHTML = (this.isTouch ? tc : pc).map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('');
  }

  // ---- キー設定 ----
  openKeys() { this.renderKeys(); this.ui.showScreen('keysScreen'); }

  renderKeys() {
    const list = document.getElementById('keyList');
    list.innerHTML = Object.keys(DEFAULT_KEYS).map((a) => `<div class="keyrow"><span>${ACTION_NAMES[a]}</span><button data-a="${a}">${keyLabel(this.input.bindings[a])}</button></div>`).join('');
    list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      list.querySelectorAll('button').forEach((x) => x.classList.remove('wait'));
      b.classList.add('wait'); b.textContent = 'キーを押す…';
      this.input.capture = (code) => {
        if (code !== 'Escape') {
          const a = b.dataset.a, cur = { ...this.input.bindings };
          const other = Object.keys(cur).find((k) => cur[k] === code && k !== a);
          if (other) cur[other] = cur[a]; // 使用中なら入れ替え
          cur[a] = code;
          this.settings.keys = cur; this.input.setBindings(cur); this.saveSettings();
          this.audio.play('ok');
        }
        this.renderKeys(); this.refreshControls();
      };
    }));
  }

  // ---- スマホのボタン配置 ----
  layoutKey() { return innerWidth > innerHeight ? 'land' : 'port'; }

  applyTouchLayout() {
    const L = this.touchLayout[this.layoutKey()] || {};
    document.querySelectorAll('#touch .tb').forEach((b) => {
      const v = L[b.id];
      if (!v) { b.style.left = b.style.top = b.style.right = b.style.bottom = b.style.transform = ''; return; }
      b.style.right = 'auto'; b.style.bottom = 'auto';
      b.style.left = `calc(${v.x}% - ${b.offsetWidth / 2}px)`;
      b.style.top = `calc(${v.y}% - ${b.offsetHeight / 2}px)`;
      b.style.transform = `scale(${v.s || 1})`;
    });
  }

  openTouchEditor() {
    const touch = document.getElementById('touch'), bar = document.getElementById('touchEditBar');
    this.ui.showScreen(null);
    touch.classList.remove('hidden'); touch.classList.add('editing'); bar.classList.remove('hidden');
    this.applyTouchLayout();
    // 今の位置を％で読み取って編集用にする
    const edit = {};
    document.querySelectorAll('#touch .tb').forEach((b) => {
      const r = b.getBoundingClientRect();
      const cur = (this.touchLayout[this.layoutKey()] || {})[b.id];
      edit[b.id] = { x: (r.left + r.width / 2) / innerWidth * 100, y: (r.top + r.height / 2) / innerHeight * 100, s: cur ? cur.s || 1 : 1 };
    });
    let sel = null;
    const size = document.getElementById('teSize'), selLabel = document.getElementById('teSel');
    const place = (b) => {
      const v = edit[b.id];
      b.style.right = 'auto'; b.style.bottom = 'auto';
      b.style.left = `calc(${v.x}% - ${b.offsetWidth / 2}px)`;
      b.style.top = `calc(${v.y}% - ${b.offsetHeight / 2}px)`;
      b.style.transform = `scale(${v.s})`;
    };
    const select = (b) => {
      document.querySelectorAll('#touch .tb').forEach((x) => x.classList.toggle('sel', x === b));
      sel = b; selLabel.textContent = b.textContent; size.value = edit[b.id].s;
    };
    const onDown = (e) => {
      const b = e.target.closest('.tb'); if (!b) return;
      e.preventDefault(); select(b);
      const move = (ev) => {
        const t = ev.touches ? ev.touches[0] : ev;
        edit[b.id].x = Math.max(3, Math.min(97, t.clientX / innerWidth * 100));
        edit[b.id].y = Math.max(3, Math.min(97, t.clientY / innerHeight * 100));
        place(b);
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    };
    touch.addEventListener('pointerdown', onDown);
    size.oninput = () => { if (sel) { edit[sel.id].s = Number(size.value); place(sel); } };
    const close = (save) => {
      touch.removeEventListener('pointerdown', onDown);
      if (save) { this.touchLayout[this.layoutKey()] = edit; store('eb_touch', JSON.stringify(this.touchLayout)); }
      touch.classList.remove('editing'); touch.classList.add('hidden'); bar.classList.add('hidden');
      document.querySelectorAll('#touch .tb').forEach((x) => x.classList.remove('sel'));
      this.applyTouchLayout();
      this.ui.showScreen('settings');
    };
    document.getElementById('teSave').onclick = () => { this.audio.play('ok'); close(true); };
    document.getElementById('teCancel').onclick = () => close(false);
    document.getElementById('teReset').onclick = () => {
      delete this.touchLayout[this.layoutKey()]; store('eb_touch', JSON.stringify(this.touchLayout));
      close(false); this.openTouchEditor();
    };
    document.getElementById('teMirror').onclick = () => {
      for (const id in edit) edit[id].x = 100 - edit[id].x;
      document.querySelectorAll('#touch .tb').forEach(place);
    };
  }

  checkOrientation() {
    const portrait = matchMedia('(orientation: portrait)').matches || innerHeight > innerWidth * 1.05;
    document.body.classList.toggle('portrait', this.isTouch && portrait && !this.rotateSkipped);
    document.body.classList.toggle('is-portrait', this.isTouch && portrait);
  }

  refreshHome() {
    const $ = (id) => document.getElementById(id);
    const P = this.profile, c = getCharacter(this.charId);
    document.querySelectorAll('#diffSel button').forEach((b) => b.classList.toggle('on', Number(b.dataset.d) === this.diffIndex));
    $('bestScore').textContent = Math.max(P.stats.bestScore, Number(load('eb_best', '0'))).toLocaleString();
    $('bestWave').textContent = Math.max(P.stats.bestWave, Number(load('eb_bestWave', '0')));
    $('btnTutorial').classList.toggle('recommend', load('eb_tutorial', '0') !== '1');
    // プロフィール
    $('lbLevel').textContent = P.level;
    $('lbName').textContent = P.name;
    $('lbTitle').textContent = P.title();
    $('lbXp').style.width = (P.xp / P.need() * 100).toFixed(1) + '%';
    $('lbXpText').textContent = `${P.xp} / ${P.need()} XP`;
    // モード
    document.querySelectorAll('#modeList .mode-card').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.modeSel));
    const mname = { wave: 'SURVIVAL', bossrush: 'BOSS RUSH', tutorial: 'TRAINING' }[this.modeSel] || 'SURVIVAL';
    $('lbModeLabel').textContent = this.modeSel === 'tutorial' ? mname : `${mname} ・ ${DIFF[this.diffIndex].name}`;
    $('diffSel').style.visibility = this.modeSel === 'tutorial' ? 'hidden' : 'visible';
    document.querySelectorAll('#mapSel button').forEach((b) => b.classList.toggle('on', b.dataset.map === this.mapSel));
    $('mapSel').classList.toggle('fixed', this.modeSel !== 'wave');
    $('mapNote').textContent = this.modeSel === 'bossrush' ? 'BOSS RUSH は専用ステージ「CORE ARENA」で戦います' : this.modeSel === 'tutorial' ? 'チュートリアルは NEON CITY で行います' : '';
    if (this.modeSel === 'wave') $('lbModeLabel').textContent = `SURVIVAL ・ ${MAPS[this.mapSel] ? MAPS[this.mapSel].name : 'NEON CITY'} ・ ${DIFF[this.diffIndex].name}`;
    if (this.modeSel === 'bossrush') $('lbModeLabel').textContent = `BOSS RUSH ・ CORE ARENA ・ ${DIFF[this.diffIndex].name}`;
    // キャラ
    $('lbcRole').textContent = c.role;
    $('lbcName').textContent = c.name;
    $('lbChar').style.setProperty('--char-c', hex(c.color));
    const LO = this.loadoutFor(c);
    $('lbcLoad').innerHTML = `<b>${WEAPONS[LO[0]].short}</b> + <b>${WEAPONS[LO[1]].short}</b>`;
    $('lbLoadDot').classList.toggle('on', P.newWeapons.length > 0);
    this.renderLoadout();
    // ミッション
    $('missionList').innerHTML = P.missions.map((m) => {
      const d = P.def(m), k = Math.min(1, m.progress / d.target);
      return `<div class="mission ${k >= 1 ? 'done' : ''}"><div class="mt">${d.text}</div><div class="mx">+${d.xp} XP</div><div class="mp"><i style="width:${(k * 100).toFixed(0)}%"></i></div><div class="mn">${Math.min(m.progress, d.target)} / ${d.target}</div></div>`;
    }).join('');
    $('lbMissionDot').classList.toggle('on', !this.missionsSeen);
    // 戦績
    const S = P.stats;
    const fav = Object.entries(S.chars).sort((a, b) => b[1] - a[1])[0];
    const cells = [['MATCHES', S.matches], ['KILLS', S.kills], ['HEADSHOTS', S.heads], ['ECHO KILLS', S.echoKills], ['BOSSES', S.bosses], ['BEST STREAK', S.bestStreak],
      ['BEST WAVE', S.bestWave], ['PLAY TIME', `${Math.floor(S.playSec / 60)}分`], ['MAIN', fav ? getCharacter(fav[0]).name : '-']];
    $('statGrid').innerHTML = cells.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }

  // 持っていく武器：メインはキャラ固有、サブは選んだもの（解放済みでなければキャラの初期サブ）
  loadoutFor(c) {
    const main = c.weapons[0];
    let sub = this.profile.loadout[c.id];
    if (sub === undefined || !WEAPONS[sub] || sub === main || unlockLevel(sub) > this.profile.level) sub = c.weapons[1];
    return [main, sub];
  }

  renderLoadout() {
    const $ = (id) => document.getElementById(id);
    const c = getCharacter(this.charId), P = this.profile;
    const [main, sub] = this.loadoutFor(c);
    const bars = (w) => {
      const dmg = Math.min(1, (w.dmg * (w.pellets || 1)) / 120);
      const rate = Math.min(1, w.rpm * (w.burst ? 2.2 : 1) / 900);
      const range = Math.min(1, w.range / 260);
      return `<div class="ld-bars">威力<i style="--v:${(dmg * 100).toFixed(0)}%"></i>連射<i style="--v:${(rate * 100).toFixed(0)}%"></i>射程<i style="--v:${(range * 100).toFixed(0)}%"></i></div>`;
    };
    const desc = (w) => w.desc || { rifle: '扱いやすい万能ライフル', shotgun: '近距離で一撃が重い散弾', rail: '貫通する高威力の狙撃', nova: '爆発で範囲にダメージ', arc: '近くの敵に自動で電撃が飛ぶ' }[w.id];
    const mw = WEAPONS[main];
    $('ldMain').style.setProperty('--wc', hex(mw.color));
    $('ldMain').innerHTML = `<span class="ld-tag">MAIN ・ ${c.name} 固有</span><span></span><span class="ld-n">${mw.name}</span><span></span><div class="ld-d">${desc(mw)}</div>${bars(mw)}`;
    const fresh = this.loadoutSeenNew || [];
    $('ldGrid').innerHTML = WEAPONS.map((w, i) => {
      if (i === main) return '';
      const lv = unlockLevel(i), locked = lv > P.level;
      const cls = ['ld-card', i === sub ? 'on' : '', locked ? 'locked' : ''].join(' ');
      const isNew = !locked && i !== sub && fresh.includes(i);
      return `<button class="${cls}" data-w="${i}" style="--wc:${hex(w.color)}" ${locked ? 'disabled' : ''}>
        <span class="ld-tag">${locked ? '🔒 LOCKED' : 'SUB'}</span><span></span><span class="ld-n">${w.name}</span><span></span>
        <div class="ld-d">${locked ? `Lv${lv} で解放（あと ${lv - P.level} レベル）` : desc(w)}</div>${bars(w)}${isNew ? '<i class="new">NEW</i>' : ''}</button>`;
    }).join('');
    $('ldGrid').querySelectorAll('.ld-card:not(.locked)').forEach((b) => b.addEventListener('click', () => {
      P.loadout[c.id] = Number(b.dataset.w); P.save();
      this.audio.init(); this.audio.play('switch');
      this.refreshHome();
    }));
  }

  // レベルアップで新しく使えるようになった武器を記録する
  checkUnlocks(r) {
    if (!r) return [];
    const got = [];
    WEAPONS.forEach((w, i) => { const lv = unlockLevel(i); if (lv > r.before.level && lv <= r.after.level) got.push(i); });
    if (got.length) { this.profile.newWeapons.push(...got); this.profile.save(); }
    return got;
  }

  // ロビーに入る：選んだキャラのアバターを右側に立たせる
  enterLobby() {
    if (this.world.mapId !== 'neon') { this.world.load('neon'); this.showcaseFloorFix && this.showcaseFloorFix(); }
    this.menuView = 'select';
    this.setShowcase(getCharacter(this.charId));
    this.refreshHome();
    this.ui.showScreen('home');
  }

  refreshSettings() {
    document.querySelectorAll('#sQuality button').forEach((b) => b.classList.toggle('on', b.dataset.q === this.settings.quality));
    document.querySelectorAll('#sAds button').forEach((b) => b.classList.toggle('on', b.dataset.m === this.settings.adsMode));
  }

  openSettings() { this.ui.showScreen('settings'); }

  // ---- キャラ選択 ----
  openCharSelect() {
    const list = document.getElementById('csList');
    if (!list.children.length) {
      list.innerHTML = CHARACTERS.map((c) => `
        <button class="cs-card" data-id="${c.id}" style="--c:${hex(c.color)}">
          <div class="cs-role">${c.role}</div>
          <div class="cs-name">${c.name}</div>
          <div class="cs-kana">${c.kana}</div>
          <div class="cs-hp">HP ${c.hp}</div>
          <div class="cs-sil">${this.silhouette(c)}</div>
          <img class="cs-por" alt="">
        </button>`).join('');
      list.querySelectorAll('.cs-card').forEach((b) => b.addEventListener('click', () => {
        this.charId = b.dataset.id; store('eb_char', this.charId); this.audio.init(); this.audio.play('ui'); this.renderCharDetail();
      }));
    }
    if (!this.portraitsDone && this.avatars.src) {
      this.portraitsDone = true;
      for (const c of CHARACTERS) {
        const url = this.avatars.portrait(c);
        const img = list.querySelector(`.cs-card[data-id="${c.id}"] .cs-por`);
        if (url && img) { img.src = url; img.closest('.cs-card').classList.add('has-por'); }
      }
    }
    this.renderCharDetail();
    this.menuView = 'select';
    this.ui.showScreen('charSelect');
  }

  // キャラ選択画面でタワーの上にアバターを立たせる
  setShowcase(char) {
    if (this.showcase && this.showcase.id === char.id) return;
    if (this.showcase) this.scene.remove(this.showcase.av.root);
    const av = this.avatars.create(char);
    if (!av) { this.showcase = null; return; }
    av.root.position.set(0, 5, 0);
    this.scene.add(av.root);
    av.play('Wave', 0.1, true);
    this.showcase = { id: char.id, av, backT: (av.actions.Wave.getClip().duration || 2) - 0.2 };
  }

  placeShowcaseCamera(narrow) {
    if (narrow) { const lobby = document.getElementById('home').classList.contains('show'); this.camera.position.set(0, 5.6, 12); this.camera.lookAt(0, lobby ? 4.35 : 3.75, 0); }
    else if (innerHeight <= 520) { this.camera.position.set(-0.9, 6.2, 8.2); this.camera.lookAt(-2.4, 6.0, 0); }
    else { this.camera.position.set(-0.7, 6.25, 6.9); this.camera.lookAt(-2.05, 5.95, 0); }
    if (this.camera.fov !== 36) { this.camera.fov = 36; this.camera.updateProjectionMatrix(); }
    this.showLight.intensity = 1.1;
  }

  hideShowcase() {
    this.menuView = 'home';
    this.showLight.intensity = 0;
    this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix();
    if (this.showcase) { this.scene.remove(this.showcase.av.root); this.showcase = null; }
  }

  silhouette(c) {
    const col = hex(c.color);
    const wide = c.id === 'boulder' ? 1.35 : c.id === 'haken' ? 0.85 : 1;
    const w = (n) => (n * wide).toFixed(1);
    return `<svg viewBox="0 0 60 100"><g fill="${col}" opacity=".8">
      <rect x="${30 - 8}" y="6" width="16" height="15" rx="3"/>
      <rect x="${30 - w(14)}" y="24" width="${w(28)}" height="30" rx="4"/>
      <rect x="${30 - w(14) - 7}" y="26" width="6" height="28" rx="3"/><rect x="${30 + w(14) + 1}" y="26" width="6" height="28" rx="3"/>
      <rect x="${30 - 11}" y="56" width="9" height="38" rx="3"/><rect x="${30 + 2}" y="56" width="9" height="38" rx="3"/>
      </g><rect x="${30 - 6}" y="11" width="12" height="3" fill="#fff"/></svg>`;
  }

  renderCharDetail() {
    const c = getCharacter(this.charId);
    this.setShowcase(c);
    document.querySelectorAll('.cs-card').forEach((b) => b.classList.toggle('on', b.dataset.id === c.id));
    const W = this.loadoutFor(c).map((i) => `<span class="wtag" style="--wc:${hex(WEAPONS[i].color)}">${WEAPONS[i].name}</span>`).join('');
    const key = this.isTouch ? { skill: c.skill === 'scan' ? 'SCAN' : 'SHOCK', ult: 'ULT', echo: 'ECHO' } : { skill: 'F', ult: 'X', echo: 'Q' };
    document.getElementById('csDetail').innerHTML = `
      <div><div class="big" style="color:${hex(c.color)}">${c.name}</div><div>${c.role} ・ HP <b>${c.hp}</b> ・ 移動 <b>${Math.round(c.speed * 100)}%</b> ・ ダッシュ <b>${c.dashMax}</b>回</div><div>${c.desc}</div></div>
      <div><h4>WEAPONS</h4>${W}<h4 style="margin-top:8px">SKILL [${key.skill}]</h4><b>${c.skillName}</b>${c.skill === 'scan' ? '：6秒間、壁の向こうの敵に目印が付く' : '：周りの敵と弾を吹き飛ばす'}</div>
      <div><h4>ULTIMATE [${key.ult}]</h4><b>${c.ultName}</b>：${c.ultDesc}<h4 style="margin-top:8px">ECHO [${key.echo}]</h4><b>${c.echoName}</b>：${c.echoDesc}</div>`;
  }
  saveSettings() { store('eb_settings', JSON.stringify(this.settings)); }

  requestLock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* 失敗したらクリックで再挑戦 */ }
  }

  enterFullscreen() {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch (e) { /* 対応していない端末 */ }
  }

  // ---- 状態の切り替え ----
  startMode(mode) {
    this.audio.init();
    this.hideShowcase();
    this.lastMode = mode;
    const bossRush = mode === 'bossrush';
    if (bossRush) mode = 'wave';
    this.waves.bossRush = bossRush;
    this.mode = mode;
    this.enemies.clear(); this.combat.clear(); this.effects.clear(); this.echo.reset();
    // マップ：チュートリアルは NEON CITY、ボスラッシュは専用ステージ
    this.world.load(mode === 'tutorial' ? 'neon' : bossRush ? 'core' : (this.mapSel || 'neon'));
    this.enemySlowT = 0;
    const ch = mode === 'wave' ? getCharacter(this.charId) : TRAINEE;
    this.weapons.reset(mode === 'wave' ? this.loadoutFor(ch) : ch.weapons);
    this.weapons.setArms(ch);
    this.stats = { shots: 0, hits: 0, kills: 0, heads: 0, echoKills: 0, wave: 0, bosses: 0 };
    this.profile.startMatch(mode === 'wave' ? this.charId : 'trainee');
    this.score = 0; this.combo = 0; this.comboT = 0; this.time = 0;
    this.streak = 0; this.multi = 0; this.lastKillT = -99; this.stats.bestStreak = 0; this.timeScale = 1; this.slowT = 0; this.trauma = 0;
    this.camera.fov = this.settings.fov;
    if (mode === 'wave') {
      this.diff = DIFF[this.diffIndex];
      const sp = this.world.cfg.spawn;
      this.player.reset(new THREE.Vector3(sp[0], sp[1], sp[2]), this.world.cfg.yaw || 0, ch);
      this.waves.start();
    } else {
      this.diff = DIFF[0];
      this.player.reset(new THREE.Vector3(0, 0, 13), 0, ch);
      this.tutorial.start();
    }
    this.ui.enterGame(mode);
    this.applyTouchLayout();
    this.ui.setKeyLabels(this.input.bindings, keyLabel);
    this.state = 'playing';
    this.input.reset();
    this.input.enabled = true;
    this.weapons.root.visible = true;
    this.clock.getDelta();
    if (this.isTouch) this.enterFullscreen(); else this.requestLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.wantResume = false;
    this.input.enabled = false; this.input.reset();
    this.ui.showScreen('pause');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  tryResume() {
    if (this.state !== 'paused') return;
    if (this.isTouch) this.resume();
    else { this.wantResume = true; this.requestLock(); }
  }

  resume() {
    this.state = 'playing';
    this.wantResume = false;
    this.ui.showScreen(null);
    this.input.reset();
    this.input.enabled = true;
    this.clock.getDelta();
  }

  toHome() {
    // 途中でやめたときも、その時点までの記録と経験値を残す（チュートリアルは除く）
    if (this.profile.match) {
      if (this.mode === 'wave' && this.state !== 'over') this.profile.endMatch(this.stats, this.score, 'wave');
      else if (this.state !== 'over') this.profile.match = null;
    }
    this.state = 'menu'; this.mode = null;
    this.input.enabled = false; this.input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    this.enemies.clear(); this.combat.clear(); this.effects.clear(); this.echo.reset();
    this.tutorial.marker.visible = false;
    this.player.releaseGrapple();
    this.weapons.root.visible = false;
    this.ui.leaveGame();
    this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix();
    this.enterLobby();
  }

  endGame() {
    this.state = 'over';
    this.input.enabled = false; this.input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    const best = Number(load('eb_best', '0'));
    const isNew = this.score > best;
    if (isNew) store('eb_best', String(this.score));
    if (this.stats.wave > Number(load('eb_bestWave', '0'))) store('eb_bestWave', String(this.stats.wave));
    const $ = (id) => document.getElementById(id);
    $('rScore').textContent = this.score.toLocaleString();
    $('rWave').textContent = this.stats.wave;
    $('rKills').textContent = this.stats.kills;
    $('rHeads').textContent = this.stats.heads;
    $('rAcc').textContent = (this.stats.shots ? Math.round(this.stats.hits / this.stats.shots * 100) : 0) + '%';
    $('rEcho').textContent = this.stats.echoKills;
    $('rDiff').textContent = this.diff.name;
    $('rNew').classList.toggle('hidden', !isNew);
    this.showXp(this.profile.endMatch(this.stats, this.score, 'wave'));
    this.ui.leaveGame();
    this.ui.showScreen('result');
  }

  showXp(r) {
    const $ = (id) => document.getElementById(id);
    if (!r) return;
    const P = this.profile;
    $('rXpGain').textContent = `+${r.total} XP`;
    $('rLv').textContent = `LV ${P.level}`;
    $('rXpBar').style.width = '0%';
    setTimeout(() => { $('rXpBar').style.width = (P.xp / P.need() * 100).toFixed(1) + '%'; }, 80);
    $('rLvUp').classList.toggle('hidden', !r.levelUp);
    const got = this.checkUnlocks(r);
    $('rMissions').innerHTML = r.done.map((d) => `<div>✓ ミッション達成：${d.text}（+${d.xp} XP）</div>`).join('')
      + got.map((i) => `<div class="rx-unlock">🔓 NEW WEAPON 解放：${WEAPONS[i].name}（ロビーの「装備」でサブ武器に設定できます）</div>`).join('');
    if (got.length) this.audio.play('unlock'); else if (r.levelUp) this.audio.play('clear');
  }

  finishTutorial() {
    if (this.mode !== 'tutorial') return;
    const got = this.checkUnlocks(this.profile.endMatch(this.stats, 0, 'tutorial'));
    document.getElementById('tutUnlock').innerHTML = got.map((i) => `<div class="rx-unlock">🔓 NEW WEAPON 解放：${WEAPONS[i].name}（ロビーの「装備」で設定）</div>`).join('');
    if (got.length) this.audio.play('unlock');
    this.state = 'over';
    this.input.enabled = false; this.input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.leaveGame();
    this.ui.showScreen('tutDone');
  }

  // ---- イベント ----
  emit(name, data) {
    if (this.state !== 'playing') return;
    if (this.mode === 'tutorial') this.tutorial.onEvent(name, data);
    else if (this.mode === 'wave') this.profile.onEvent(name, data);
  }

  getTargetFor(e) { return this.echo.active && e.preferEcho ? this.echo.target : this.playerTarget; }

  onEnemyDamaged(e, amount, owner) {
    if (owner === 'player') {
      this.player.echoMeter = Math.min(100, this.player.echoMeter + amount * 0.28);
      this.player.ultMeter = Math.min(100, this.player.ultMeter + amount * 0.18);
    }
  }

  onHitFeedback(e, dmg, head, point, owner, killed) {
    if (owner !== 'player' && owner !== 'echo') return;
    this.ui.damageNumber(point, dmg, head, owner);
    if (owner === 'player') {
      this.ui.hitmarkerShow(head, killed);
      this.audio.play(head ? 'head' : 'hit');
    }
  }

  onEnemyKilled(e, owner, head) {
    if (e.type !== 'dummy') this.stats.kills++;
    if (head) this.stats.heads++;
    if (owner === 'echo') this.stats.echoKills++;
    if (e.type !== 'dummy') this.player.ultMeter = Math.min(100, this.player.ultMeter + 6);
    if (e.T.score) {
      this.combo++; this.comboT = 3.5;
      const mult = 1 + Math.min(this.combo - 1, 10) * 0.1;
      const pts = Math.round((e.T.score + (head ? 50 : 0) + (owner === 'echo' ? 50 : 0)) * mult);
      if (this.mode === 'wave') { this.score += pts; this.ui.scorePop(`+${pts}${head ? ' HEADSHOT' : ''}${owner === 'echo' ? ' ECHO' : ''}`); }
    }
    // 連続キル（短い時間に続けて倒す）と、死なずに倒し続けるキルストリーク
    if (e.type !== 'dummy' && (owner === 'player' || owner === 'echo')) {
      this.multi = this.time - this.lastKillT < 1.8 ? this.multi + 1 : 1;
      this.lastKillT = this.time;
      this.streak++;
      this.stats.bestStreak = Math.max(this.stats.bestStreak || 0, this.streak);
      const mk = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL' }[this.multi] || (this.multi >= 5 ? 'MULTI KILL' : null);
      if (mk) {
        this.emit('multi');
        this.ui.announce(mk, '#ffb02e');
        if (this.mode === 'wave') this.score += 50 * this.multi;
        this.audio.play('clear', 0.6);
      }
      this.emit('streak', { value: this.streak });
      if (e.type === 'boss') this.stats.bosses++;
      const st = { 5: 'KILLING SPREE', 10: 'RAMPAGE', 15: 'UNSTOPPABLE', 25: 'GODLIKE' }[this.streak];
      if (st) { this.ui.announce(st, '#ff3ad8'); if (this.mode === 'wave') this.score += 100 * this.streak; this.audio.play('wave', 0.6); }
      if (head) this.ui.announce('HEADSHOT', '#ffd23a');
    }
    const wdef = owner === 'echo' ? WEAPONS[this.weapons.cur] : this.weapons.def;
    this.ui.killfeedAdd(owner, wdef, e.T.name, head);
    this.audio.play('kill');
    this.emit('kill', { owner, type: e.type, head });
  }

  onPlayerDeath() {
    this.streak = 0;
    this.deathT = 2.0;
    this.slowmo(1.2);
    this.input.reset();
    this.ui.center('DEFEATED', `WAVE ${this.stats.wave} で力尽きた`, 3);
    this.audio.play('die');
    this.weapons.root.visible = false;
  }

  slowmo(t) { this.slowT = t; }
  shake(a) { this.trauma = Math.min(1, this.trauma + a); }

  // ---- ループ ----
  loop() {
    requestAnimationFrame(this.loop);
    const raw = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'playing') {
      if (this.slowT > 0) { this.slowT -= raw; this.timeScale = damp(this.timeScale, 0.3, 14, raw); }
      else this.timeScale = damp(this.timeScale, 1, 5, raw);
      this.update(raw * this.timeScale, raw);
    } else if (this.state === 'menu') {
      this.menuT += raw;
      if (this.menuView === 'select' && this.showcase) {
        const sc = this.showcase;
        const narrow = innerWidth < innerHeight * 1.2;
        this.placeShowcaseCamera(narrow);
        sc.av.mixer.update(raw);
        sc.av.root.rotation.y = Math.PI + Math.sin(this.menuT * 0.6) * 0.35;
        if (sc.backT > 0) { sc.backT -= raw; if (sc.backT <= 0) sc.av.play('Idle', 0.4); }
      } else {
        const t = this.menuT * 0.07;
        this.camera.position.set(Math.cos(t) * 36, 12 + Math.sin(this.menuT * 0.3) * 2, Math.sin(t) * 36);
        this.camera.lookAt(0, 5, 0);
      }
      this.world.update(raw);
      this.effects.update(raw);
    }
    if (this.grade) this.grade.uniforms.uTime.value = (this.grade.uniforms.uTime.value + raw) % 100;
    if (this.camHook) this.camHook(raw);
    this.composer.render();
    if (this.afterRender) this.afterRender(raw);
    this.input.endFrame();
  }

  update(dt, raw) {
    this.time += dt;
    if (this.trailerHook) this.trailerHook(dt);
    this.player.update(dt, this.input);
    this.player.updateCamera(dt);
    this.weapons.update(dt, this.input, this.player);
    this.echo.record(this.time);
    this.echo.update(dt);
    if (this.enemySlowT > 0) this.enemySlowT -= dt;
    this.enemies.update(dt * (this.enemySlowT > 0 ? 0.3 : 1));
    this.combat.update(dt);
    this.effects.update(dt);
    this.world.update(dt);
    if (this.mode === 'wave') this.waves.update(dt);
    else if (this.mode === 'tutorial') this.tutorial.update(dt);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    if (this.input.pressed('pause')) this.pause();
    // 画面の揺れ
    this.trauma = Math.max(0, this.trauma - raw * 1.8);
    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const t = this.time * 45;
      this.camera.rotation.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9)) * 0.5 * 0.03 * s;
      this.camera.rotation.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1)) * 0.5 * 0.03 * s;
      this.camera.rotation.z += Math.sin(t * 2.3 + 2) * 0.02 * s;
    }
    this.effects.setScale(innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
    this.ui.cls(this.ui.hud, 'chrono', this.enemySlowT > 0);
    this.ui.cls(this.ui.hud, 'veil', this.echo.active && this.echo.veil);
    this.ui.cls(this.ui.hud, 'overdrive', this.player.overdriveT > 0);
    this.ui.update(raw);
    if (!this.player.alive && this.state === 'playing') { this.deathT -= raw; if (this.deathT <= 0) this.endGame(); }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
    // 宣伝動画の撮影モード（URLに ?trailer を付けたときだけ）
    if (location.search.includes('trailer2')) import('./trailer2.js').then((m) => m.setup(window.game));
    else if (location.search.includes('trailer')) import('./trailer.js').then((m) => m.setup(window.game));
  } catch (e) {
    console.error(e);
    const t = document.getElementById('loadText');
    if (t) t.textContent = '起動に失敗しました：' + e.message;
  }
});
