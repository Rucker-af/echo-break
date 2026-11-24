// ゲームモード：NPC戦（ウェーブ・サバイバル）とチュートリアル
import * as THREE from 'three';
import { pick, rand } from './utils.js';

export class WaveMode {
  constructor(game) { this.game = game; }

  start() {
    this.wave = 0; this.queue = []; this.inBreak = true; this.breakT = 2.5; this.spawnT = 0;
    this.game.ui.center('NPC BATTLE', '押し寄せる機械兵を殲滅せよ', 2.4);
  }

  nextWave() {
    const n = ++this.wave, g = this.game;
    const q = [];
    for (let i = 0; i < 3 + n; i++) q.push('trooper');
    if (n >= 2) for (let i = 0; i < Math.floor(n * 0.8); i++) q.push('drone');
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    if (n >= 3) for (let i = 0; i < Math.floor((n - 1) / 2); i++) q.splice(Math.floor(q.length * (0.4 + Math.random() * 0.6)), 0, 'brute');
    this.queue = q; this.total = q.length;
    this.inBreak = false; this.spawnT = 0.5;
    g.stats.wave = n;
    const sub = n === 1 ? 'トルーパー部隊接近' : n === 2 ? 'ドローン飛来！ 上空に注意' : n === 3 ? '重装兵ブルート出現！' : `敵 ${q.length} 体`;
    g.ui.center(`WAVE ${n}`, sub, 2.2);
    g.audio.play('wave');
  }

  remaining() { return this.queue.length + this.game.enemies.aliveCount(); }

  update(dt) {
    const g = this.game;
    if (this.inBreak) {
      this.breakT -= dt;
      if (this.breakT <= 0) this.nextWave();
      return;
    }
    const alive = g.enemies.aliveCount();
    this.spawnT -= dt;
    const maxAlive = Math.min(5 + this.wave, 14);
    if (this.queue.length && alive < maxAlive && this.spawnT <= 0) { this.spawn(this.queue.shift()); this.spawnT = rand(0.4, 0.9); }
    if (!this.queue.length && alive === 0) {
      this.inBreak = true; this.breakT = 5.5;
      const bonus = 250 * this.wave;
      g.score += bonus;
      g.slowmo(0.9);
      g.player.heal(35);
      g.ui.center('WAVE CLEAR', `ボーナス +${bonus}　HP回復`, 3);
      g.audio.play('clear');
    }
  }

  spawn(type) {
    const g = this.game, pp = g.player.pos;
    let pts = g.world.spawnPoints.filter((p) => p.distanceTo(pp) > 18);
    if (type === 'brute') pts = pts.filter((p) => p.y < 1);
    if (!pts.length) pts = g.world.spawnPoints;
    const p = pick(pts).clone();
    p.x += rand(-2, 2); p.z += rand(-2, 2);
    if (type === 'drone') p.y = rand(5, 8);
    const yaw = Math.atan2(pp.x - p.x, pp.z - p.z);
    g.enemies.spawn(type, p, { hpMul: g.diff.hp * (1 + 0.07 * (this.wave - 1)), yaw });
  }
}

// ---- チュートリアル ----
const DUMMY_FRONT = [[-7, 15], [0, 17], [7, 15]];
const STEPS = [
  { title: '視点', pc: 'マウスを動かして、周りを見渡そう', touch: '画面の<b>右側をドラッグ</b>して、周りを見渡そう', prog: (g) => g.player.lookAccum / 4 },
  { title: '移動', pc: '<b>W A S D</b> で歩き回ろう', touch: '<b>左側のスティック</b>で歩き回ろう', prog: (g) => g.player.moveAccum / 25 },
  { title: 'ダブルジャンプ', pc: '<b>SPACE</b> でジャンプ。空中でもう一度押すと<b>ダブルジャンプ</b>（2回）', touch: '<b>JUMP</b> でジャンプ。空中でもう一度押すと<b>ダブルジャンプ</b>（2回）', event: 'doubleJump', count: 2 },
  { title: 'ダッシュ', pc: '<b>SHIFT</b> で瞬間<b>ダッシュ</b>（3回）。2回分までためておける', touch: '<b>DASH</b> で瞬間<b>ダッシュ</b>（3回）。2回分までためておける', event: 'dash', count: 3 },
  { title: 'スライディング', pc: '走りながら <b>C</b> で<b>スライディング</b>（2回）。そのままジャンプすると勢いが残る', touch: '走りながら <b>SLIDE</b> で<b>スライディング</b>（2回）', event: 'slide', count: 2 },
  { title: 'ジャンプパッド', pc: '光る<b>ジャンプパッド</b>に乗って、中央タワーの上へ飛ぼう', touch: '光る<b>ジャンプパッド</b>に乗って、中央タワーの上へ飛ぼう', event: 'pad', count: 1, marker: [0, 9.5] },
  { title: 'グラップルフック', pc: '<b>E</b> で<b>フック</b>を撃ち、壁や柱へ飛びつこう（2回）。もう一度押すか SPACE で解除', touch: '<b>HOOK</b> で壁や柱へ飛びつこう（2回）', event: 'grapple', count: 2 },
  { title: '射撃', pc: '<b>左クリック</b>で射撃、<b>右クリック</b>でエイム。タワーの南にいる<b>ターゲット</b>を3体破壊', touch: '<b>FIRE を押したままドラッグ</b>で狙って撃つ。<b>ADS</b> でエイム。ターゲットを3体破壊', event: 'kill', count: 3, setup: 'front' },
  { title: '武器', pc: '<b>1〜5 キー</b>かホイールで武器を切り替え。<b>5種類すべて</b>撃ってみよう', touch: '<b>⇄</b> か画面右下の武器名をタップして切り替え。<b>5種類すべて</b>撃とう', custom: 'weapons', count: 5 },
  { title: 'ショックウェーブ', pc: 'ターゲットに近づいて <b>F</b> で<b>ショックウェーブ</b>。周りの敵と弾を吹き飛ばす', touch: 'ターゲットに近づいて <b>SHOCK</b>。周りの敵と弾を吹き飛ばす', event: 'shockHit', count: 1, setup: 'near' },
  { title: 'ECHO', pc: '<b>ECHOシステム</b>：直近5秒の動きと射撃は常に記録されている。ターゲットを撃ちながら動いてから <b>Q</b> で<b>エコー</b>を解き放て！', touch: '<b>ECHOシステム</b>：直近5秒の行動は常に記録中。ターゲットを撃ちながら動いてから <b>ECHO</b> を押せ！', event: 'echoEnd', count: 1, setup: 'echo' },
  { title: '実戦', pc: '最終訓練：敵トルーパー3体を撃破せよ。赤い弾は<b>動けば避けられる</b>', touch: '最終訓練：敵トルーパー3体を撃破せよ。赤い弾は<b>動けば避けられる</b>', event: 'kill', filter: (d) => d.type === 'trooper', count: 3, setup: 'real' },
];

export class TutorialMode {
  constructor(game) {
    this.game = game;
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23a).multiplyScalar(3) });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4), mat);
    cone.rotation.x = Math.PI; g.add(cone);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23a).multiplyScalar(1.5), transparent: true, opacity: 0.5 }));
    beam.position.y = 3.6; g.add(beam);
    g.visible = false;
    game.scene.add(g);
    this.marker = g;
  }

  start() {
    this.step = -1; this.weaponsUsed = new Set(); this.waitT = 0; this.done = false;
    this.game.ui.center('TRAINING', '基本操作を身につけよう', 2);
    this.next();
  }

  next() {
    const g = this.game;
    this.step++;
    this.count = 0;
    if (this.step >= STEPS.length) { this.finish(); return; }
    const s = STEPS[this.step];
    this.marker.visible = !!s.marker;
    if (s.marker) this.marker.position.set(s.marker[0], 2.2, s.marker[1]);
    if (s.setup) this.setup(s.setup);
    this.render();
  }

  setup(kind) {
    const g = this.game;
    g.enemies.clear();
    if (kind === 'front') for (const [x, z] of DUMMY_FRONT) g.enemies.spawn('dummy', new THREE.Vector3(x, 0, z));
    if (kind === 'near') {
      const p = g.player.pos;
      const base = p.y > 3 ? new THREE.Vector3(0, 0, 12) : p.clone().setY(0);
      for (let i = 0; i < 3; i++) {
        const sy = Math.sin(g.player.yaw), cy = Math.cos(g.player.yaw);
        let x = base.x - sy * 4.5 + cy * (i - 1) * 2.5, z = base.z - cy * 4.5 - sy * (i - 1) * 2.5;
        if (!g.world.free(x, 0, z, 0.5, 1.9)) { x = DUMMY_FRONT[i][0]; z = DUMMY_FRONT[i][1]; }
        g.enemies.spawn('dummy', new THREE.Vector3(x, 0, z));
      }
    }
    if (kind === 'echo') {
      g.player.echoMeter = 100;
      for (const [x, z] of [[-8, 16], [-3, 18], [3, 18], [8, 16]]) g.enemies.spawn('dummy', new THREE.Vector3(x, 0, z));
    }
    if (kind === 'real') {
      for (const [x, z] of [[-14, 30 - 6], [0, 38], [14, 24]]) {
        g.enemies.spawn('trooper', new THREE.Vector3(x, 0, z), { hpMul: 0.8 });
      }
    }
  }

  onEvent(name, data) {
    if (this.waitT > 0 || this.done) return;
    const s = STEPS[this.step];
    if (!s) return;
    if (name === 'shock' && data && data.count > 0) name = 'shockHit';
    if (s.custom === 'weapons' && name === 'fire') { this.weaponsUsed.add(data.weapon); this.count = this.weaponsUsed.size; }
    else if (s.event === name && (!s.filter || s.filter(data || {}))) this.count++;
    if (s.event === 'kill' && name === 'kill' && s.setup === 'front' && this.game.enemies.aliveCount() === 0 && this.count < s.count) this.setup('front');
    this.render();
  }

  progress() {
    const s = STEPS[this.step];
    if (!s) return 1;
    if (s.prog) return Math.min(1, s.prog(this.game));
    return Math.min(1, this.count / s.count);
  }

  render() {
    const s = STEPS[this.step];
    if (!s) return;
    const g = this.game;
    g.ui.setTutorial(`${this.step + 1} / ${STEPS.length}　${s.title}`, g.isTouch ? s.touch : s.pc, this.progress(), s.count ? `${Math.min(this.count, s.count)} / ${s.count}` : '');
  }

  update(dt) {
    const g = this.game;
    if (this.done) return;
    if (this.marker.visible) { this.marker.position.y = 2.2 + Math.sin(g.time * 3) * 0.3; this.marker.rotation.y += dt * 2; }
    const s = STEPS[this.step];
    if (s && s.setup === 'echo' && !g.echo.active && g.player.echoMeter < 100 && this.count === 0) g.player.echoMeter = 100;
    if (this.waitT > 0) {
      this.waitT -= dt;
      if (this.waitT <= 0) this.next();
      return;
    }
    if (s && s.prog) this.render();
    if (this.progress() >= 1) {
      this.waitT = 1.0;
      g.audio.play('ok');
      g.ui.tutorialOK();
    }
  }

  finish() {
    this.done = true;
    this.marker.visible = false;
    try { localStorage.setItem('eb_tutorial', '1'); } catch (e) { /* 保存できなくても続行 */ }
    this.game.ui.center('TRAINING COMPLETE', '', 2);
    setTimeout(() => this.game.finishTutorial(), 1600);
  }
}
