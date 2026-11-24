// ECHO//BREAK — ゲーム全体をまとめる本体
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Input } from './input.js';
import { World } from './world.js';
import { Effects } from './effects.js';
import { EnemyManager } from './enemies.js';
import { Combat } from './combat.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS } from './weapons.js';
import { EchoSystem } from './echo.js';
import { UI } from './ui.js';
import { WaveMode, TutorialMode } from './modes.js';
import { AudioFX } from './audio.js';
import { damp } from './utils.js';

const DIFF = [
  { name: 'EASY', dmg: 0.5, rate: 0.7, acc: 1.7, hp: 0.8 },
  { name: 'NORMAL', dmg: 1, rate: 1, acc: 1, hp: 1 },
  { name: 'HARD', dmg: 1.4, rate: 1.3, acc: 0.6, hp: 1.15 },
];

function store(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* 保存できない環境 */ } }
function load(key, def) { try { const v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; } }

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
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x160b28, 0.0062);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.03, 1500);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.time = 0; this.timeScale = 1; this.slowT = 0; this.trauma = 0;
    this.state = 'menu'; this.mode = null; this.menuT = 0;
    this.score = 0; this.combo = 0; this.comboT = 0; this.deathT = 0;
    this.stats = { shots: 0, hits: 0, kills: 0, heads: 0, echoKills: 0, wave: 0 };
    this.diff = DIFF[1];

    this.audio = new AudioFX();
    this.audio.setVolume(this.settings.volume);
    this.input = new Input(this);
    this.effects = new Effects(this);
    this.world = new World(this);
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
    Promise.race([this.world.ready, new Promise((r) => setTimeout(r, 9000))])
      .then(() => { this.applyDetail(); try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* 失敗しても続行 */ } })
      .then(() => setTimeout(() => { if (this.state === 'menu') this.ui.showScreen('home'); }, 200));
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
    this.bloom = new UnrealBloomPass(bres, 0.7, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
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
    for (const m of this.weapons.models) m.group.traverse((o) => { if (o.isMesh && !seen.has(o.material)) { seen.add(o.material); touch(o.material, null, aW, 0); } });
    for (const t of ['trooper', 'drone', 'brute', 'dummy']) {
      const mats = this.enemies.mats(t);
      touch(mats.armor, nE, aE, 0.8); touch(mats.dark, nE, aE, 0.8);
    }
  }

  // ---- DOM ----
  bindDom() {
    const $ = (id) => document.getElementById(id);
    addEventListener('resize', () => { this.resize(); this.checkOrientation(); });
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
    click('btnBattle', () => this.startMode('wave'));
    click('btnTutorial', () => this.startMode('tutorial'));
    click('btnSettings', () => { this.settingsBack = 'home'; this.openSettings(); });
    click('btnSettingsBack', () => this.ui.showScreen(this.settingsBack));
    click('btnResume', () => this.tryResume());
    click('btnPauseSettings', () => { this.settingsBack = 'pause'; this.openSettings(); });
    click('btnQuit', () => this.toHome());
    click('btnRetry', () => this.startMode(this.mode || 'wave'));
    click('btnHome', () => this.toHome());
    click('btnTutToBattle', () => this.startMode('wave'));
    click('btnTutHome', () => this.toHome());
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
    const pc = [['WASD', '移動'], ['マウス', '視点'], ['左クリック', '射撃'], ['右クリック / V', 'エイム（ADS）'], ['SPACE', 'ジャンプ / 二段'], ['SHIFT', 'ダッシュ'], ['C', 'スライディング'], ['E', 'グラップルフック'], ['F', 'ショックウェーブ'], ['Q', 'ECHO 発動'], ['R', 'リロード'], ['1-5 / ホイール', '武器切替']];
    const tc = [['左スティック', '移動'], ['右側ドラッグ', '視点'], ['FIRE', '押したまま狙える'], ['ADS', 'エイム切替'], ['JUMP', 'ジャンプ / 二段'], ['DASH', 'ダッシュ'], ['SLIDE', 'スライディング'], ['HOOK', 'グラップル'], ['SHOCK', '衝撃波'], ['ECHO', 'エコー発動'], ['⇄', '武器切替']];
    $('controlsList').innerHTML = (this.isTouch ? tc : pc).map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('');
    this.checkOrientation();
  }

  checkOrientation() {
    const portrait = matchMedia('(orientation: portrait)').matches || innerHeight > innerWidth * 1.05;
    document.body.classList.toggle('portrait', this.isTouch && portrait && !this.rotateSkipped);
    document.body.classList.toggle('is-portrait', this.isTouch && portrait);
  }

  refreshHome() {
    document.querySelectorAll('#diffSel button').forEach((b) => b.classList.toggle('on', Number(b.dataset.d) === this.diffIndex));
    document.getElementById('bestScore').textContent = Number(load('eb_best', '0')).toLocaleString();
    document.getElementById('bestWave').textContent = load('eb_bestWave', '0');
    document.getElementById('btnTutorial').classList.toggle('recommend', load('eb_tutorial', '0') !== '1');
  }

  refreshSettings() {
    document.querySelectorAll('#sQuality button').forEach((b) => b.classList.toggle('on', b.dataset.q === this.settings.quality));
    document.querySelectorAll('#sAds button').forEach((b) => b.classList.toggle('on', b.dataset.m === this.settings.adsMode));
  }

  openSettings() { this.ui.showScreen('settings'); }
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
    this.mode = mode;
    this.enemies.clear(); this.combat.clear(); this.effects.clear(); this.echo.reset(); this.weapons.reset();
    this.stats = { shots: 0, hits: 0, kills: 0, heads: 0, echoKills: 0, wave: 0 };
    this.score = 0; this.combo = 0; this.comboT = 0; this.time = 0; this.timeScale = 1; this.slowT = 0; this.trauma = 0;
    this.camera.fov = this.settings.fov;
    if (mode === 'wave') {
      this.diff = DIFF[this.diffIndex];
      this.player.reset(new THREE.Vector3(0, 5.01, 0), 0);
      this.waves.start();
    } else {
      this.diff = DIFF[0];
      this.player.reset(new THREE.Vector3(0, 0, 13), 0);
      this.tutorial.start();
    }
    this.ui.enterGame(mode);
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
    this.state = 'menu'; this.mode = null;
    this.input.enabled = false; this.input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    this.enemies.clear(); this.combat.clear(); this.effects.clear(); this.echo.reset();
    this.tutorial.marker.visible = false;
    this.player.releaseGrapple();
    this.weapons.root.visible = false;
    this.ui.leaveGame();
    this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix();
    this.refreshHome();
    this.ui.showScreen('home');
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
    this.ui.leaveGame();
    this.ui.showScreen('result');
  }

  finishTutorial() {
    if (this.mode !== 'tutorial') return;
    this.state = 'over';
    this.input.enabled = false; this.input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.leaveGame();
    this.ui.showScreen('tutDone');
  }

  // ---- イベント ----
  emit(name, data) { if (this.mode === 'tutorial' && this.state === 'playing') this.tutorial.onEvent(name, data); }

  getTargetFor(e) { return this.echo.active && e.preferEcho ? this.echo.target : this.playerTarget; }

  onEnemyDamaged(e, amount, owner) {
    if (owner === 'player') this.player.echoMeter = Math.min(100, this.player.echoMeter + amount * 0.28);
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
    if (e.T.score) {
      this.combo++; this.comboT = 3.5;
      const mult = 1 + Math.min(this.combo - 1, 10) * 0.1;
      const pts = Math.round((e.T.score + (head ? 50 : 0) + (owner === 'echo' ? 50 : 0)) * mult);
      if (this.mode === 'wave') { this.score += pts; this.ui.scorePop(`+${pts}${head ? ' HEADSHOT' : ''}${owner === 'echo' ? ' ECHO' : ''}`); }
    }
    const wdef = owner === 'echo' ? WEAPONS[this.weapons.cur] : this.weapons.def;
    this.ui.killfeedAdd(owner, wdef, e.T.name, head);
    this.audio.play('kill');
    this.emit('kill', { owner, type: e.type, head });
  }

  onPlayerDeath() {
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
      const t = this.menuT * 0.07;
      this.camera.position.set(Math.cos(t) * 36, 12 + Math.sin(this.menuT * 0.3) * 2, Math.sin(t) * 36);
      this.camera.lookAt(0, 5, 0);
      this.world.update(raw);
      this.effects.update(raw);
    }
    this.composer.render();
    this.input.endFrame();
  }

  update(dt, raw) {
    this.time += dt;
    this.player.update(dt, this.input);
    this.player.updateCamera(dt);
    this.weapons.update(dt, this.input, this.player);
    this.echo.record(this.time);
    this.echo.update(dt);
    this.enemies.update(dt);
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
    this.ui.update(raw);
    if (!this.player.alive && this.state === 'playing') { this.deathT -= raw; if (this.deathT <= 0) this.endGame(); }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
  } catch (e) {
    console.error(e);
    const t = document.getElementById('loadText');
    if (t) t.textContent = '起動に失敗しました：' + e.message;
  }
});
