// 宣伝動画の撮影モード：台本どおりにプレイを自動で動かし、文字を重ねて録画する
// 使い方：index.html?trailer を開き、コンソールで trailer.start({ record: true })
import * as THREE from 'three';
import { damp } from './utils.js';

const W = 1280, H = 720, END = 22.5;
const URL_TEXT = 'rucker-af.github.io/echo-break';

// 画面に出す文字（開始秒・終了秒・本文）
const CAPTIONS = [
  [3.0, 6.3, 'ダッシュ・二段ジャンプ・スライディング'],
  [6.6, 11.2, 'グラビティ砲で まとめて吸い込む'],
  [11.6, 15.3, '5秒前の自分が いっしょに戦う「ECHO」'],
  [15.6, 18.9, '巨大ボス「ウォーデン」'],
];

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);

export function setup(game) {
  const tr = new Trailer(game);
  window.trailer = tr;
  return tr;
}

class Trailer {
  constructor(g) {
    this.g = g;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    // 録画される映像をそのまま画面にも重ねて見せる
    Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: 9999, pointerEvents: 'none', display: 'none', background: '#000' });
    document.body.appendChild(this.canvas);
    this.running = false;
  }

  // 床の高さ（見つからなければ y）
  ground(x, z, y = 0) {
    const w = this.g.world.raycast(_v.set(x, 40, z), _down, 80);
    return w ? w.point.y : y;
  }

  // 今の向きの前方 dist m の地点
  ahead(dist, side = 0) {
    const p = this.g.player, s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    const x = p.pos.x - s * dist + c * side, z = p.pos.z - c * dist - s * side;
    return new THREE.Vector3(x, this.ground(x, z, p.pos.y), z);
  }

  aimAt(target, k, dt) {
    const p = this.g.player, cam = this.g.camera;
    const d = _v.subVectors(target, cam.position);
    const yaw = Math.atan2(-d.x, -d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    let dy = yaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    p.yaw += dy * Math.min(1, k * dt);
    p.pitch = damp(p.pitch, pitch, k, dt);
  }

  nearest() {
    let best = null, bd = 1e9;
    for (const e of this.g.enemies.list) {
      if (!e.isActive()) continue;
      const d = e.center(_c).distanceTo(this.g.camera.position);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // 場面転換：プレイヤーを別の場所へ移す
  cut(x, z, yaw) {
    const p = this.g.player, b = p.body;
    b.pos.set(x, this.ground(x, z, 0) + 0.02, z);
    b.vel.set(0, 0, 0);
    p.yaw = yaw; p.pitch = -0.03;
    this.cutT = this.T;
  }

  // 一度だけ実行する予定
  once(t, key, fn) { if (this.T >= t && !this.done.has(key)) { this.done.add(key); fn(); } }

  hold(a, on) { const I = this.g.input; if (on) I.press(a); else I.release(a); }

  async start({ record = false, upload = null, end = END } = {}) {
    this.end = end;
    const g = this.g;
    g.noAutoPause = true;
    g.charId = 'vector';
    g.settings.fov = 84;
    g.audio.init();
    g.startMode('wave');
    // 動画用に少し明るく
    g.renderer.toneMappingExposure = 1.0;
    if (g.bloom) g.bloom.strength = 0.45;
    g.waves.update = () => {};
    g.player.takeDamage = () => {};
    g.weapons.reset([0, 8]);
    g.weapons.setArms(g.player.char);
    g.player.echoMeter = 100;
    g.input.enabled = true;
    g.player.yaw = 0.0; g.player.pitch = -0.02;
    document.body.classList.add('trailer');
    this.canvas.style.display = 'block';
    this.T = 0; this.done = new Set(); this.running = true; this.cutT = undefined; this.boss = null; this.clusterC = null;
    this.focus = null;

    g.trailerHook = (dt) => this.step(dt);
    g.afterRender = () => this.draw();

    if (record) {
      // 画面が隠れていても確実に録れるよう、1コマずつ手動で渡す
      const stream = this.canvas.captureStream(0);
      this.vtrack = stream.getVideoTracks()[0];
      if (g.audio.out) {
        const dest = g.audio.ctx.createMediaStreamDestination();
        g.audio.out.connect(dest);
        for (const tk of dest.stream.getAudioTracks()) stream.addTrack(tk);
      }
      const mime = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      this.chunks = [];
      this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
      this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.rec.start(500);
      this.mime = mime;
    }
    return new Promise((res) => { this.finish = res; }).then(async () => {
      if (!this.rec) return { ok: true };
      await new Promise((r) => { this.rec.onstop = r; this.rec.stop(); });
      const blob = new Blob(this.chunks, { type: this.mime.split(';')[0] });
      this.blob = blob;
      let up = null;
      if (upload) up = await fetch(upload, { method: 'POST', body: blob }).then((r) => r.status).catch((e) => String(e));
      return { size: blob.size, mime: this.mime, upload: up };
    });
  }

  step(dt) {
    const g = this.g, p = g.player, T = this.T += dt;
    const wp = g.weapons;

    // A：タイトル（ゆっくり見回す）
    if (T < 3) { p.yaw += dt * 0.12; p.pitch = damp(p.pitch, 0.02, 2, dt); }

    // B：移動
    this.once(2.95, 'cutB', () => this.cut(-15, -26, Math.PI));
    this.once(3.0, 'fwd', () => this.hold('fwd', true));
    this.once(3.3, 'dash', () => this.hold('dash', true));
    this.once(3.45, 'dashUp', () => this.hold('dash', false));
    this.once(3.9, 'j1', () => this.hold('jump', true));
    this.once(4.0, 'j1u', () => this.hold('jump', false));
    this.once(4.35, 'j2', () => this.hold('jump', true));
    this.once(4.45, 'j2u', () => this.hold('jump', false));
    this.once(5.35, 'sl', () => this.hold('slide', true));
    this.once(5.5, 'slu', () => this.hold('slide', false));
    if (T > 3 && T < 6.3) { p.yaw += Math.sin(T * 1.7) * dt * 0.18; p.pitch = damp(p.pitch, -0.04, 3, dt); }
    this.once(6.3, 'stop', () => this.hold('fwd', false));

    // C：グラビティ砲
    this.once(6.4, 'spawnC', () => {
      this.hold('fwd', false);
      this.cut(-15, -2, Math.PI);
      wp.select(8);
      const c = this.ahead(11);
      this.clusterC = c;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, r = 3.5 + (i % 2) * 3;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        const e = g.enemies.spawn(i === 3 ? 'drone' : 'trooper', new THREE.Vector3(x, this.ground(x, z, c.y) + (i === 3 ? 3 : 0.05), z), { instant: true });
        e.hp = 50; // 一撃でまとめて倒れるように
      }
    });
    if (T > 6.4 && T < 8.6 && this.clusterC) this.aimAt(_c.copy(this.clusterC).setY(this.clusterC.y + 0.6), 7, dt);
    this.once(7.4, 'grav', () => { wp.cooldown = 0; wp.switchT = 0; if (wp.cur === 8) wp.fire(p); });
    this.once(8.7, 'toRifle', () => wp.select(0));
    if (T > 8.7 && T < 11.5) this.fight(dt, T > 9.1);

    // D：ECHO
    this.once(11.4, 'spawnD', () => {
      for (let i = 0; i < 4; i++) {
        const c = this.ahead(12 + i * 2.5, (i - 1.5) * 5);
        g.enemies.spawn(i % 2 ? 'drone' : 'trooper', c.setY(c.y + (i % 2 ? 4 : 0.05)), { instant: true });
      }
    });
    this.once(11.8, 'echo', () => { p.echoMeter = 100; g.echo.activate(); });
    this.once(12.0, 'strafeR', () => this.hold('right', true));
    this.once(13.4, 'strafeRu', () => { this.hold('right', false); this.hold('left', true); });
    this.once(14.8, 'strafeLu', () => this.hold('left', false));
    if (T > 11.5 && T < 15.4) this.fight(dt, T > 12.2);

    // E：ボス
    this.once(15.4, 'boss', () => {
      for (const e of g.enemies.list) if (e.isActive() && e.type !== 'boss') g.enemies.kill(e, 'world', false);
      this.cut(10, -24, Math.PI);
      const c = this.ahead(13);
      this.boss = g.enemies.spawn('boss', c.setY(c.y + 0.05), { instant: true });
      // 動画用：ボスを照らすライト（プレイヤー側から白、上から赤）
      const fill = new THREE.PointLight(0xdfe6ff, 140, 30, 1.4);
      fill.position.copy(c).lerp(p.pos, 0.45).setY(c.y + 6);
      const rim = new THREE.PointLight(0xff3a5a, 90, 20, 1.4);
      rim.position.set(c.x, c.y + 9, c.z + 3);
      g.scene.add(fill, rim);
      this.lights = [fill, rim];
      g.ui.announce && g.ui.announce('WARNING', '#ff2b4a');
      p.ultMeter = 100;
    });
    if (T > 15.4 && T < 19 && this.boss) {
      this.aimAt(this.boss.center(_c), 6, dt);
      this.hold('fire', T > 16.0 && wp.cur === 0);
    }
    this.once(15.7, 'ads', () => this.hold('ads', true));
    this.once(17.1, 'adsOff', () => this.hold('ads', false));
    this.once(18.0, 'ads2', () => this.hold('ads', true));
    this.once(18.9, 'ads2Off', () => this.hold('ads', false));
    this.once(16.3, 'ult', () => { p.ultMeter = 100; p.activateUlt(); });
    this.once(17.2, 'bossGrav', () => { this.hold('fire', false); wp.select(8); });
    this.once(17.8, 'bossGravFire', () => { wp.cooldown = 0; wp.switchT = 0; wp.reloadT = 0; wp.st.ammo = wp.def.mag; if (wp.cur === 8) wp.fire(p); });
    this.once(18.4, 'bossRifle', () => wp.select(0));

    // F：締め
    this.once(19.0, 'endFire', () => this.hold('fire', false));
    if (T > 19) { p.yaw += dt * 0.05; p.pitch = damp(p.pitch, 0.12, 1.5, dt); }
    if (T >= this.end && this.running) this.stop();
  }

  // 一番近い敵を狙って撃つ
  fight(dt, shoot) {
    const e = this.nearest();
    if (!e) { this.hold('fire', false); return; }
    const c = e.center(_c);
    if (e.T.hitboxes[0].part === 'head') c.y += 0.45;
    this.aimAt(c, 9, dt);
    this.hold('fire', shoot && this.g.weapons.cur === 0);
  }

  stop() {
    const g = this.g;
    this.running = false;
    for (const a of ['fwd', 'left', 'right', 'fire', 'jump', 'dash', 'slide', 'ads']) this.hold(a, false);
    g.trailerHook = null;
    for (const l of this.lights || []) g.scene.remove(l);
    setTimeout(() => { g.afterRender = null; document.body.classList.remove('trailer'); if (this.finish) this.finish(); }, 120);
  }

  // 3D画面に文字を重ねて、録画用のキャンバスに描く
  draw() {
    const g = this.g, x = this.ctx, T = this.T;
    x.drawImage(g.renderer.domElement, 0, 0, W, H);
    const fade = (a, b, f = 0.35) => Math.max(0, Math.min(1, (T - a) / f, (b - T) / f));

    // 照準
    if (T > 3 && T < 19) {
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2;
      x.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { x.moveTo(W / 2 + dx * 6, H / 2 + dy * 6); x.lineTo(W / 2 + dx * 14, H / 2 + dy * 14); }
      x.stroke();
    }

    // 場面転換の光
    if (this.cutT !== undefined && T >= this.cutT && T - this.cutT < 0.25) {
      x.fillStyle = `rgba(255,255,255,${0.55 * (1 - (T - this.cutT) / 0.25)})`;
      x.fillRect(0, 0, W, H);
    }
    // 上下の黒帯（映画風）
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, 36); x.fillRect(0, H - 36, W, 36);

    // タイトル
    const ta = fade(0.2, 2.9, 0.5);
    if (ta > 0) this.logo(W / 2, H / 2 - 20, 92, ta, 'ブラウザで遊べる 爽快SF FPS');

    // 説明文
    for (const [a, b, text] of CAPTIONS) {
      const k = fade(a, b);
      if (k <= 0) continue;
      x.save();
      x.globalAlpha = k;
      x.font = '900 40px "Noto Sans JP"';
      const w = x.measureText(text).width;
      const px = 70 - (1 - k) * 30, py = H - 110;
      x.fillStyle = 'rgba(5,3,15,.72)';
      x.fillRect(px - 20, py - 46, w + 40, 64);
      x.fillStyle = '#ff3ad8'; x.fillRect(px - 20, py - 46, 6, 64);
      x.fillStyle = '#fff';
      x.fillText(text, px, py);
      x.restore();
    }

    // 締めのカード
    const ea = Math.max(0, Math.min(1, (T - 19) / 0.6));
    if (ea > 0) {
      x.fillStyle = `rgba(5,3,15,${0.78 * ea})`;
      x.fillRect(0, 0, W, H);
      this.logo(W / 2, H / 2 - 60, 96, ea, null);
      x.save();
      x.globalAlpha = Math.max(0, Math.min(1, (T - 19.6) / 0.5));
      x.textAlign = 'center';
      x.font = '700 34px "Noto Sans JP"'; x.fillStyle = '#fff';
      x.fillText('無料・インストール不要 ｜ PC・スマホ対応', W / 2, H / 2 + 40);
      x.font = '700 30px Orbitron, sans-serif'; x.fillStyle = '#3ee8ff';
      x.shadowColor = '#3ee8ff'; x.shadowBlur = 14;
      x.fillText(URL_TEXT, W / 2, H / 2 + 100);
      x.restore();
    }
    if (this.vtrack && this.vtrack.requestFrame) this.vtrack.requestFrame();
  }

  logo(cx, cy, size, alpha, sub) {
    const x = this.ctx;
    x.save();
    x.globalAlpha = alpha;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `900 ${size}px Orbitron, sans-serif`;
    const a = 'ECHO', s = '//', b = 'BREAK';
    const wa = x.measureText(a).width, ws = x.measureText(s).width, wb = x.measureText(b).width;
    let px = cx - (wa + ws + wb) / 2;
    x.textAlign = 'left';
    x.shadowBlur = 24;
    x.shadowColor = '#3ee8ff'; x.fillStyle = '#fff'; x.fillText(a, px, cy); px += wa;
    x.shadowColor = '#ff3ad8'; x.fillStyle = '#ff3ad8'; x.fillText(s, px, cy); px += ws;
    x.shadowColor = '#3ee8ff'; x.fillStyle = '#fff'; x.fillText(b, px, cy);
    if (sub) {
      x.shadowBlur = 0; x.textAlign = 'center';
      x.font = '700 30px "Noto Sans JP"'; x.fillStyle = 'rgba(255,255,255,.9)';
      x.fillText(sub, cx, cy + size * 0.85);
    }
    x.restore();
  }
}
