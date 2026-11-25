// 画面表示（HUD・メニュー・演出）
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { damp, hex } from './utils.js';

const _v = new THREE.Vector3();
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.g = game;
    const ids = ['hud', 'hpNum', 'hpFill', 'hpGhost', 'ammoCur', 'ammoMax', 'weaponName', 'weaponBox', 'reloadBar', 'slots', 'waveLabel', 'scoreLabel', 'comboLabel', 'enemyLabel',
      'killfeed', 'centerMsg', 'hitmarker', 'crosshair', 'dmgVignette', 'dmgDirs', 'dmgNums', 'scorePops', 'rec', 'recTime', 'skDash', 'skGrapple', 'skShock', 'skEcho', 'skUlt',
      'scope', 'clickToPlay', 'tutorial', 'tStep', 'tText', 'tProg', 'tCount', 'touch', 'topbar', 'toastBox', 'speed', 'echoBannerEl', 'flashFx', 'radar', 'announceBox', 'bossBar', 'bossFill', 'buffs'];
    for (const id of ids) this[id] = $(id);
    this.cache = {}; this.nums = []; this.ghost = 100; this.vig = 0; this.centerT = 0;
    this.slotEls = [];
    this.screens = ['loading', 'home', 'charSelect', 'settings', 'keysScreen', 'pause', 'result', 'tutDone'];
  }

  txt(key, el, v) { if (this.cache[key] !== v) { this.cache[key] = v; el.textContent = v; } }
  cls(el, c, on) { el.classList.toggle(c, !!on); }

  showScreen(name) {
    for (const s of this.screens) $(s).classList.toggle('show', s === name);
  }
  showOverlay(name, on) { $(name).classList.toggle('show', on); }

  setKeyLabels(b, label) {
    const set = (id, a) => { const el = $(id).querySelector('.sk-key'); if (el) el.textContent = label(b[a]); };
    set('skDash', 'dash'); set('skGrapple', 'grapple'); set('skShock', 'shock'); set('skEcho', 'echo'); set('skUlt', 'ult');
    const h = $('adsHint'); if (h) h.textContent = `ADS（構える）：右クリック / ${label(b.ads)}`;
  }

  enterGame(mode) {
    this.showScreen(null);
    this.hud.classList.remove('hidden');
    this.cls(this.hud, 'mode-tutorial', mode === 'tutorial');
    this.tutorial.classList.toggle('hidden', mode !== 'tutorial');
    this.touch.classList.toggle('hidden', !this.g.isTouch);
    this.killfeed.innerHTML = ''; this.dmgNums.innerHTML = ''; this.dmgDirs.innerHTML = ''; this.scorePops.innerHTML = '';
    this.nums = []; this.cache = {}; this.vig = 0; this.ghost = 100;
    this.centerMsg.classList.remove('show');
    // キャラに合わせて武器スロット・ダッシュの目盛り・スキル名を作り直す
    const g = this.g, c = g.player.char;
    this.slots.innerHTML = '';
    this.slotEls = g.weapons.loadout.map((wi, k) => {
      const w = WEAPONS[wi];
      const d = document.createElement('div');
      d.className = 'slot'; d.dataset.action = 'w' + (k + 1); d.dataset.w = wi;
      d.style.setProperty('--c', hex(w.color));
      d.innerHTML = `<b>${k + 1}</b><span>${w.short}</span>`;
      this.slots.appendChild(d);
      return d;
    });
    this.skDash.querySelector('.pips').innerHTML = '<i></i>'.repeat(g.player.dashMax);
    const skName = c.skill === 'scan' ? 'SCAN' : 'SHOCK';
    this.skShock.querySelector('.sk-ic').textContent = skName;
    $('tbShock').textContent = skName;
    this.cls(this.skUlt, 'hidden', mode === 'tutorial');
    this.cls($('tbUlt'), 'hidden', mode === 'tutorial');
    this.skUlt.style.setProperty('--uc', hex(c.color));
    this.hud.style.setProperty('--char', hex(c.color));
  }

  leaveGame() {
    this.hud.classList.add('hidden');
    this.touch.classList.add('hidden');
    this.clickToPlay.classList.add('hidden');
  }

  center(title, sub = '', dur = 2) {
    this.centerMsg.querySelector('.cm-title').textContent = title;
    this.centerMsg.querySelector('.cm-sub').textContent = sub;
    this.centerMsg.classList.remove('show'); void this.centerMsg.offsetWidth;
    this.centerMsg.classList.add('show');
    this.centerT = dur;
  }

  toast(text) {
    const t = this.toastBox;
    t.textContent = text;
    t.classList.remove('show'); void t.offsetWidth;
    t.classList.add('show');
  }

  flash(color) {
    const f = this.flashFx;
    f.style.background = color;
    f.classList.remove('go'); void f.offsetWidth;
    f.classList.add('go');
  }

  announce(text, color = '#ffffff') {
    const el = document.createElement('div');
    el.className = 'ann';
    el.textContent = text;
    el.style.setProperty('--c', color);
    this.announceBox.prepend(el);
    while (this.announceBox.children.length > 3) this.announceBox.lastChild.remove();
    setTimeout(() => el.remove(), 1900);
  }

  speedLines() {
    this.speed.classList.remove('go'); void this.speed.offsetWidth;
    this.speed.classList.add('go');
  }

  echoBanner() {
    const e = this.echoBannerEl;
    e.classList.remove('go'); void e.offsetWidth;
    e.classList.add('go');
  }

  hitmarkerShow(head, kill) {
    const h = this.hitmarker;
    h.classList.remove('show', 'head', 'kill'); void h.offsetWidth;
    h.classList.add('show');
    if (head) h.classList.add('head');
    if (kill) h.classList.add('kill');
  }

  damageNumber(pos, amount, head, owner) {
    const el = document.createElement('div');
    el.className = 'dnum' + (head ? ' head' : '') + (owner === 'echo' ? ' echo' : '');
    el.textContent = Math.round(amount);
    this.dmgNums.appendChild(el);
    this.nums.push({ el, pos: pos.clone().add(_v.set((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4)), life: 0.8 });
    if (this.nums.length > 30) { const n = this.nums.shift(); n.el.remove(); }
  }

  scorePop(text) {
    const el = document.createElement('div');
    el.className = 'spop'; el.textContent = text;
    this.scorePops.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  killfeedAdd(owner, weapon, victim, head) {
    const el = document.createElement('div');
    el.className = 'kf' + (owner === 'echo' ? ' echo' : '');
    el.innerHTML = `<span class="kf-o">${owner === 'echo' ? 'ECHO' : 'YOU'}</span><span class="kf-w" style="--c:${hex(weapon.color)}">${weapon.short}</span>${head ? '<span class="kf-h">◎HEAD</span>' : ''}<span class="kf-v">${victim}</span>`;
    this.killfeed.prepend(el);
    while (this.killfeed.children.length > 5) this.killfeed.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
  }

  damage(amount, from) {
    this.vig = Math.min(1, this.vig + amount / 30);
    if (!from) return;
    const p = this.g.player;
    const dx = from.x - p.pos.x, dz = from.z - p.pos.z;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy; // 視点基準（前 = -z）
    const ang = Math.atan2(lx, -lz) * 180 / Math.PI;
    const el = document.createElement('div');
    el.className = 'ddir';
    el.style.transform = `rotate(${ang}deg)`;
    this.dmgDirs.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  setTutorial(step, text, prog, count) {
    this.tStep.textContent = step;
    if (this.cache.tText !== text) { this.cache.tText = text; this.tText.innerHTML = text; this.tutorial.classList.remove('ok'); }
    this.tProg.style.width = (prog * 100).toFixed(1) + '%';
    this.tCount.textContent = count;
  }
  tutorialOK() { this.tutorial.classList.add('ok'); this.tProg.style.width = '100%'; }

  update(dt) {
    const g = this.g, p = g.player, w = g.weapons, def = w.def, st = w.st;
    // HP
    this.txt('hp', this.hpNum, Math.ceil(p.health));
    const pct = Math.max(0, p.health / p.maxHealth * 100);
    this.hpFill.style.width = pct + '%';
    this.ghost = this.ghost > pct ? damp(this.ghost, pct, 3, dt) : pct;
    this.hpGhost.style.width = this.ghost + '%';
    this.cls(this.hud, 'lowhp', p.health < 30 && p.alive);
    // 武器
    this.txt('ammo', this.ammoCur, st.ammo);
    this.txt('amax', this.ammoMax, '/ ' + def.mag);
    this.txt('wn', this.weaponName, def.name);
    if (this.cache.wc !== def.color) { this.cache.wc = def.color; this.weaponBox.style.setProperty('--wc', hex(def.color)); }
    this.cls(this.ammoCur, 'low', st.ammo <= Math.ceil(def.mag * 0.25));
    this.reloadBar.firstElementChild.style.width = (w.reloadT > 0 ? (1 - w.reloadT / def.reload) * 100 : 0) + '%';
    this.cls(this.reloadBar, 'on', w.reloadT > 0);
    this.slotEls.forEach((el) => this.cls(el, 'on', Number(el.dataset.w) === w.cur));
    // スキル
    const pips = this.skDash.querySelectorAll('.pips i');
    pips.forEach((el, i) => {
      const f = i < p.dashCharges ? 1 : i === p.dashCharges ? p.dashRecharge / 2 : 0;
      el.style.setProperty('--p', f);
    });
    this.skill(this.skGrapple, p.grappleCD, p.char.grappleCD, p.grapple.active);
    this.skill(this.skShock, p.shockCD, p.char.skillCD, g.enemies.scanT > 0);
    const um = Math.floor(p.ultMeter);
    this.skUlt.style.setProperty('--p', p.ultMeter / 100);
    this.cls(this.skUlt, 'ready', um >= 100);
    this.cls(this.skUlt, 'active', p.overdriveT > 0 || !!p.meteor || g.enemySlowT > 0 || g.combat.shields.length > 0);
    this.txt('um', this.skUlt.querySelector('.sk-num'), um >= 100 ? 'READY' : um + '%');
    const em = Math.floor(p.echoMeter);
    this.skEcho.style.setProperty('--p', p.echoMeter / 100);
    this.cls(this.skEcho, 'ready', em >= 100 && !g.echo.active);
    this.cls(this.skEcho, 'active', g.echo.active);
    this.txt('em', this.skEcho.querySelector('.sk-num'), g.echo.active ? 'PLAY' : em >= 100 ? 'READY' : em + '%');
    this.txt('rec', this.recTime, g.echo.recSeconds().toFixed(1) + 's');
    this.cls(this.rec, 'play', g.echo.active);
    // タッチボタンのクールダウン
    if (g.isTouch) {
      $('tbHook').style.setProperty('--cd', p.grappleCD / p.char.grappleCD);
      $('tbShock').style.setProperty('--cd', p.shockCD / p.char.skillCD);
      $('tbUlt').style.setProperty('--cd', 1 - p.ultMeter / 100);
      this.cls($('tbUlt'), 'ready', um >= 100);
      $('tbEcho').style.setProperty('--cd', 1 - p.echoMeter / 100);
      this.cls($('tbEcho'), 'ready', em >= 100);
      this.cls($('tbAds'), 'on', g.input.adsToggle);
      $('tbDash').style.setProperty('--cd', p.dashCharges > 0 ? 0 : 1 - p.dashRecharge / 2);
    }
    // スコープ・照準
    const scoped = def.id === 'rail' && w.adsT > 0.85;
    this.cls(this.scope, 'on', scoped);
    w.root.visible = !scoped;
    const spread = 4 + w.spreadNow * 700;
    this.crosshair.style.setProperty('--s', spread.toFixed(1) + 'px');
    this.crosshair.style.opacity = scoped ? 0 : Math.max(0, 1 - w.adsT * 1.4).toFixed(2);
    this.crosshair.style.setProperty('--c', hex(def.color));
    // 上部バー
    if (g.mode === 'wave') {
      this.txt('wave', this.waveLabel, 'WAVE ' + Math.max(1, g.waves.wave));
      this.txt('enemy', this.enemyLabel, '残り ' + g.waves.remaining());
    } else {
      this.txt('wave', this.waveLabel, 'TRAINING');
      this.txt('enemy', this.enemyLabel, '');
    }
    this.txt('score', this.scoreLabel, g.score.toLocaleString());
    this.txt('combo', this.comboLabel, g.combo >= 2 ? `${g.combo} COMBO ×${(1 + Math.min(g.combo - 1, 10) * 0.1).toFixed(1)}` : '');
    // メッセージ
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) this.centerMsg.classList.remove('show'); }
    // 被弾の赤み
    this.vig = Math.max(0, this.vig - dt * 0.9);
    this.dmgVignette.style.opacity = Math.min(1, this.vig + (p.health < 30 ? 0.35 + Math.sin(g.time * 6) * 0.15 : 0)).toFixed(2);
    // ダメージ数字
    const cam = g.camera, W = innerWidth, H = innerHeight;
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life -= dt;
      if (n.life <= 0) { n.el.remove(); this.nums.splice(i, 1); continue; }
      n.pos.y += dt * 1.2;
      _v.copy(n.pos).project(cam);
      if (_v.z > 1) { n.el.style.opacity = 0; continue; }
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      n.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-50%) scale(${(0.8 + n.life * 0.5).toFixed(2)})`;
      n.el.style.opacity = Math.min(1, n.life * 3).toFixed(2);
    }
    this.drawRadar();
    // ボスの体力
    const boss = g.enemies.list.find((e) => e.alive && e.T.boss && e.state === 'active');
    this.cls(this.bossBar, 'hidden', !boss);
    if (boss) this.bossFill.style.width = Math.max(0, boss.hp / boss.maxHp * 100).toFixed(1) + '%';
    // パワーアップの残り時間
    const chips = [];
    if (p.buffs.dmg > 0) chips.push(`<span style="--c:#ff3d5a">DMG ×1.5 <b>${Math.ceil(p.buffs.dmg)}</b></span>`);
    if (p.buffs.haste > 0) chips.push(`<span style="--c:#3aff9a">HASTE <b>${Math.ceil(p.buffs.haste)}</b></span>`);
    if (p.overdriveT > 0) chips.push(`<span style="--c:#3ee8ff">OVERDRIVE <b>${Math.ceil(p.overdriveT)}</b></span>`);
    if (g.enemySlowT > 0) chips.push(`<span style="--c:#ff3ad8">CHRONO <b>${Math.ceil(g.enemySlowT)}</b></span>`);
    const html = chips.join('');
    if (this.cache.buffs !== html) { this.cache.buffs = html; this.buffs.innerHTML = html; }
    this.cls(this.clickToPlay, 'hidden', g.isTouch || g.input.locked || g.state !== 'playing');
  }

  // レーダー：周り50mの敵・回復・エコーを、自分の向きを上にして表示
  drawRadar() {
    const c = this.radar, ctx = c.getContext('2d'), g = this.g, p = g.player;
    const W = c.width, R = W / 2 - 4, range = 50;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.fillStyle = 'rgba(6,10,24,0.62)'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(62,232,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(62,232,255,0.15)'; ctx.stroke();
    const sweep = (g.time * 2) % (Math.PI * 2);
    ctx.fillStyle = 'rgba(62,232,255,0.08)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, sweep - 0.5, sweep); ctx.fill();
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const dot = (x, z, color, r) => {
      const dx = x - p.pos.x, dz = z - p.pos.z;
      let lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
      const d = Math.hypot(lx, lz);
      const k = R / range;
      let px = lx * k, py = lz * k;
      if (d > range) { px = lx / d * (R - 3); py = lz / d * (R - 3); r *= 0.7; }
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const o of g.combat.orbs) dot(o.pos.x, o.pos.z, '#3aff9a', 2.5);
    for (const pu of g.combat.powerups || []) dot(pu.pos.x, pu.pos.z, '#ffd23a', 3.5);
    for (const e of g.enemies.list) {
      if (!e.alive) continue;
      const above = e.pos.y - p.pos.y > 3, below = p.pos.y - e.pos.y > 3;
      dot(e.pos.x, e.pos.z, e.type === 'boss' ? '#ff2b4a' : e.state === 'spawn' ? 'rgba(255,80,100,0.4)' : (above || below) ? '#ff9aa8' : '#ff3d5a', e.type === 'boss' ? 6 : e.type === 'brute' ? 4.2 : 3);
    }
    if (g.echo.active) dot(g.echo.pos.x, g.echo.pos.z, '#9d7bff', 3.5);
    // 自分（上向きの矢印）
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  skill(el, cd, max, active) {
    el.style.setProperty('--p', cd / max);
    this.cls(el, 'cooling', cd > 0);
    this.cls(el, 'active', active);
    const num = el.querySelector('.sk-num');
    const v = cd > 0 ? Math.ceil(cd).toString() : '';
    if (num.textContent !== v) num.textContent = v;
  }
}
