// マップの組み立て：NEON CITY（夜の街・拡大版）／SKYLINE（青空の市街地）／CORE ARENA（ボス専用ステージ）
// どのマップも build(w) で World の部品を使って組み立て、設定（cfg）を返す
import * as THREE from 'three';
import { NEON, canvasTex, scaleBoxUV } from './world.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 床（テクスチャの細かさをマップの広さに合わせる）
function floorPlane(w, size, mat, y = 0) {
  const geo = new THREE.PlaneGeometry(size, size);
  const k = size / 156;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  const floor = new THREE.Mesh(geo, mat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = y; floor.receiveShadow = true;
  w.root.add(floor);
  return floor;
}

// 外周の壁と、外へ出られないようにする見えない壁
function boundary(w, S, WH, mat, trimA, trimB, mid = 7) {
  w.addBox(0, 0, -S - 1, S * 2 + 4, WH, 2, mat, { trim: trimA, midTrim: mid });
  w.addBox(0, 0, S + 1, S * 2 + 4, WH, 2, mat, { trim: trimA, midTrim: mid });
  w.addBox(-S - 1, 0, 0, 2, WH, S * 2, mat, { trim: trimB, midTrim: mid });
  w.addBox(S + 1, 0, 0, 2, WH, S * 2, mat, { trim: trimB, midTrim: mid });
  w.addCollider(-S - 3, WH, -S - 3, S + 3, 160, -S);
  w.addCollider(-S - 3, WH, S, S + 3, 160, S + 3);
  w.addCollider(-S - 3, WH, -S, -S, 160, S);
  w.addCollider(S, WH, -S, S + 3, 160, S);
}

function spawnsFrom(w, list, h = 3.1) {
  for (const [x, z, y = 0] of list) if (w.free(x, y, z, 1.0, h)) w.spawnPoints.push(V(x, y, z));
}

// =====================================================================
// NEON CITY：夜のサイバー都市。中央の旧アリーナ（156m）の外側に環状エリアを足して 236m 四方に拡大
// =====================================================================
function buildNeon(w) {
  const S = 118, OLD = 78, IN = 46;
  w.buildLights({ hemiSky: 0x9fb4ff, hemiGround: 0x2a1438, hemiI: 0.7, sun: 0xffd9c2, sunI: 2.0, sunPos: [60, 110, 40], shadowR: 125, rim: 0xff4fd8, rimI: 0.35 });
  const l1 = new THREE.PointLight(0xff2bd6, 11, 30, 1.6); l1.position.set(0, 9, 0); w.root.add(l1);
  const l2 = new THREE.PointLight(0x2fe6ff, 5, 30, 1.6); l2.position.set(0, 6, 30); w.root.add(l2);
  w.coreLight = l1;

  floorPlane(w, S * 2, w.matFloor);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x07060c, roughness: 0.9 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05;
  w.root.add(outer);

  // 一番外の壁
  boundary(w, S, 22, w.matWall, 'magenta', 'cyan', 9);
  for (let i = -104; i <= 104; i += 13) {
    w.addVStrip(i, 0.5, 21.5, -S + 0.05, 'cyan'); w.addVStrip(i, 0.5, 21.5, S - 0.05, 'cyan');
    w.addVStrip(-S + 0.05, 0.5, 21.5, i, 'magenta'); w.addVStrip(S - 0.05, 0.5, 21.5, i, 'magenta');
  }

  // 旧アリーナの外壁：ゲート（通り道）付きの内壁にする
  const WH = 14;
  const segs = [[-OLD, -45], [-35, -5], [5, 35], [45, OLD]];
  for (const [a, b] of segs) {
    const len = b - a, mid = (a + b) / 2;
    w.addBox(mid, 0, -OLD - 1, len, WH, 2, w.matWall, { trim: 'magenta', midTrim: 6 });
    w.addBox(mid, 0, OLD + 1, len, WH, 2, w.matWall, { trim: 'magenta', midTrim: 6 });
    w.addBox(-OLD - 1, 0, mid, 2, WH, len, w.matWall, { trim: 'cyan', midTrim: 6 });
    w.addBox(OLD + 1, 0, mid, 2, WH, len, w.matWall, { trim: 'cyan', midTrim: 6 });
  }
  // ゲートの門柱と上のはり
  for (const g of [-40, 0, 40]) {
    for (const [x, z, horiz] of [[g, -OLD - 1, true], [g, OLD + 1, true], [-OLD - 1, g, false], [OLD + 1, g, false]]) {
      if (horiz) w.addBox(x, 9, z, 10, 5, 2, w.matDark, { trim: 'amber', collide: false });
      else w.addBox(x, 9, z, 2, 5, 10, w.matDark, { trim: 'amber', collide: false });
    }
  }
  // 中央ゲートにはレーザー（点いたり消えたりする）
  w.addLaser(0, -OLD - 1, 10, 'x', { phase: 0 });
  w.addLaser(0, OLD + 1, 10, 'x', { phase: 1.2 });
  w.addLaser(-OLD - 1, 0, 10, 'z', { phase: 0.6 });
  w.addLaser(OLD + 1, 0, 10, 'z', { phase: 1.8 });

    // 中央エリアを囲む低い壁（真ん中と両わきに通り道）
    const iw = 6;
    for (const side of [-1, 1]) {
      for (const [a, b] of [[-IN, -26], [-18, -9], [9, 18], [26, IN]]) {
        const len = b - a, mid = (a + b) / 2;
        w.addBox(mid, 0, side * (IN + 1), len, iw, 1.6, w.matWall, { trim: 'magenta' });
        w.addBox(side * (IN + 1), 0, mid, 1.6, iw, len, w.matWall, { trim: 'cyan' });
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.addBox(sx * (IN + 1), 0, sz * (IN + 1), 3, iw + 2, 3, w.matDark, { trim: 'amber' });


    // 中央タワー
    w.addBox(0, 0, 0, 10, 5, 10, w.matWall, { trim: 'magenta', midTrim: 2.5 });
    w.addBox(-3.2, 5, -4.55, 3, 0.9, 0.7, w.matDark, { trim: 'cyan' });
    w.addBox(3.2, 5, 4.55, 3, 0.9, 0.7, w.matDark, { trim: 'cyan' });
    w.addBox(-4.55, 5, 3.2, 0.7, 0.9, 3, w.matDark, { trim: 'cyan' });
    w.addBox(4.55, 5, -3.2, 0.7, 0.9, 3, w.matDark, { trim: 'cyan' });

    // 四隅の高台
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      w.addBox(sx * 30, 0, sz * 30, 14, 4, 14, w.matWall, { trim: 'cyan', midTrim: 2 });
      w.addBox(sx * 26, 4, sz * 33, 3, 1.1, 1.2, w.matCrate, { trim: 'amber' });
      w.addBox(sx * 33, 4, sz * 26, 1.2, 1.1, 3, w.matCrate, { trim: 'amber' });
    }
    // 南北の空中通路
    for (const sz of [-1, 1]) {
      w.addBox(0, 3.4, sz * 30, 46, 0.6, 4, w.matDark, { trim: 'amber' });
      for (const px of [-11.5, 0, 11.5]) w.addBox(px, 0, sz * 30, 0.8, 3.4, 0.8, w.matDark);
      w.addBox(-6, 4, sz * 31.6, 4, 0.8, 0.4, w.matDark, { trim: 'amber' });
      w.addBox(6, 4, sz * 28.4, 4, 0.8, 0.4, w.matDark, { trim: 'amber' });
    }

    // 遮蔽物
    const covers = [
      [-12, -6, 3, 1.6, 6], [12, 6, 3, 1.6, 6], [0, -20, 8, 1.4, 2], [0, 20, 8, 1.4, 2],
      [-24, 0, 3, 3, 8], [24, 0, 3, 3, 8], [-36, -6, 2, 2.4, 6], [36, 6, 2, 2.4, 6],
      [-8, 34, 5, 2, 2], [8, -34, 5, 2, 2],
    ];
    for (const [x, z, cw, h, d] of covers) w.addBox(x, 0, z, cw, h, d, w.matWall, { trim: 'cyan' });
    const crates = [[-20, 12], [20, -12], [-34, 10], [34, -10], [14, 38], [-14, -38], [-6, 12], [6, -12], [-17, -22], [17, 22]];
    for (const [x, z] of crates) {
      w.addBox(x, 0, z, 2, 2, 2, w.matCrate, { trim: 'amber' });
      if (Math.abs(x) > 15) w.addBox(x + 0.3, 2, z - 0.2, 1.2, 1.2, 1.2, w.matCrate);
    }
    // 柱（グラップルで飛び移れる）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      w.addBox(sx * 17, 0, sz * 14, 2, 12, 2, w.matDark, { trim: 'magenta' });
      w.addVStrip(sx * 17 + 1.02, 0.5, 11.5, sz * 14, 'magenta');
      w.addVStrip(sx * 17 - 1.02, 0.5, 11.5, sz * 14, 'magenta');
    }

    // ジャンプパッド
    w.addPad(0, 9.5, 0, -1);
    w.addPad(0, -9.5, 0, 1);
    w.addPad(9.5, 0, -1, 0);
    w.addPad(-9.5, 0, 1, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.addPad(sx * 19, sz * 25.5, sx, 0, 8, 19);

    // タワー上のコア（演出）
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x220018, emissive: NEON.magenta, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.2 });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), coreMat);
    core.position.set(0, 10, 0);
    w.group.add(core);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.cyan).multiplyScalar(2.4) });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.05, 8, 80), ringMat); r1.position.copy(core.position);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.035, 8, 80), w.trimMats.magenta); r2.position.copy(core.position);
    w.group.add(r1, r2);
    w.anim.push((t) => {
      core.rotation.y = t * 0.8; core.position.y = 10 + Math.sin(t * 1.3) * 0.35;
      r1.rotation.set(t * 0.6, t * 0.4, 0); r2.rotation.set(-t * 0.3, 0, t * 0.5);
      r1.position.y = r2.position.y = core.position.y;
    });



  // ---- 旧アリーナ外側の4エリア ----
  {
    const S = OLD;
    const o = IN + 3; // 外側エリアの内側の端
    // ---- 北：コンテナヤード ----
    const cont = (x, z, rot, stack = 1) => {
      for (let k = 0; k < stack; k++) {
        if (rot) w.addBox(x, k * 2.7, z, 6.2, 2.6, 2.5, w.matCrate, { trim: k === stack - 1 ? 'amber' : null });
        else w.addBox(x, k * 2.7, z, 2.5, 2.6, 6.2, w.matCrate, { trim: k === stack - 1 ? 'amber' : null });
      }
    };
    const yard = [[-58, -56, 1, 2], [-50, -64, 0, 1], [-38, -58, 1, 1], [-30, -68, 1, 3], [-18, -56, 0, 2], [-8, -66, 1, 1],
      [8, -58, 1, 2], [16, -68, 0, 1], [26, -56, 1, 1], [34, -64, 0, 2], [46, -58, 1, 3], [58, -66, 1, 1], [64, -54, 0, 2]];
    for (const [x, z, r, st] of yard) cont(x, z, r, st);
    // クレーン
    for (const cx of [-24, 30]) {
      w.addBox(cx - 6, 0, -72, 1.2, 16, 1.2, w.matDark, { trim: 'amber' });
      w.addBox(cx + 6, 0, -72, 1.2, 16, 1.2, w.matDark, { trim: 'amber' });
      w.addBox(cx, 16, -72, 14, 1, 1.4, w.matDark, { trim: 'amber' });
      w.addBox(cx, 8, -72, 3, 1.4, 3, w.matCrate, { collide: false });
    }
    w.addPad(-12, -52, 0, -1, 6, 19);
    w.addPad(40, -52, 0, -1, 6, 19);

    // ---- 南：プラザ ----
    // 階段つきのステージ
    w.addBox(0, 0, 64, 24, 3, 10, w.matWall, { trim: 'cyan', midTrim: 1.5 });
    for (let i = 0; i < 4; i++) w.addBox(0, 0, 58.5 - i, 10, 2.4 - i * 0.6, 1.0, w.matDark, { trim: i === 0 ? 'cyan' : null });
    w.addBox(0, 3, 67, 6, 6, 2, w.matDark, { trim: 'magenta' });
    // 植え込み・ベンチ
    for (const [x, z] of [[-30, 56], [30, 56], [-44, 66], [44, 66], [-18, 72], [18, 72], [-56, 54], [56, 54]]) {
      w.addBox(x, 0, z, 5, 1.2, 5, w.matDark, { trim: 'cyan' });
    }
    // 記念塔（グラップル用）
    for (const x of [-38, 38]) {
      w.addBox(x, 0, 62, 2.4, 20, 2.4, w.matWall, { trim: 'magenta' });
      w.addVStrip(x + 1.22, 0.5, 19.5, 62, 'magenta');
      w.addVStrip(x - 1.22, 0.5, 19.5, 62, 'magenta');
    }

    // ---- 東：ルーフトップ ----
    const roofs = [[56, -36, 12, 3, 10], [66, -14, 10, 6, 12], [56, 10, 12, 9, 10], [68, 34, 10, 5, 14], [54, 56, 12, 3, 10]];
    for (const [x, z, rw, h, d] of roofs) {
      w.addBox(x, 0, z, rw, h, d, w.matWall, { trim: 'cyan', midTrim: h / 2 });
      w.addBox(x - rw / 2 + 1, h, z, 0.6, 1, d, w.matDark, { trim: 'amber' });
    }
    // 屋根どうしをつなぐ橋
    w.addBox(61, 5.4, -25, 3, 0.6, 6, w.matDark, { trim: 'amber' });
    w.addBox(61, 8.4, -2, 3, 0.6, 6, w.matDark, { trim: 'amber' });
    w.addPad(52, -24, 1, 0, 7, 19);
    w.addPad(50, 22, 1, 0, 7, 22);
    w.addPad(50, 34, 1, 0, 8, 18);

    // ---- 西：ファクトリー ----
    for (const [x, z] of [[-60, -30], [-66, -10], [-60, 14], [-68, 36]]) {
      w.addBox(x, 0, z, 6, 9, 6, w.matDark, { trim: 'magenta', midTrim: 4.5 }); // タンク
    }
    // 高い通路（キャットウォーク）
    w.addBox(-54, 5, 0, 3, 0.6, 70, w.matDark, { trim: 'amber' });
    for (const z of [-30, -15, 0, 15, 30]) w.addBox(-54, 0, z, 0.8, 5, 0.8, w.matDark);
    w.addPad(-50, -40, -1, 0, 5, 18);
    w.addPad(-50, 40, -1, 0, 5, 18);
    // パイプ
    for (const y of [2.2, 4.0]) w.addBox(-74, y, 0, 1.2, 1.2, 120, w.matDark, { trim: 'cyan' });
    // 西のバリケード
    for (const [x, z] of [[-60, -52], [-60, 52], [-66, 24], [-58, -2]]) w.addBox(x, 0, z, 4, 1.6, 1.2, w.matWall, { trim: 'cyan' });
  }


  // ---- 外周リング（新エリア） ----
  // 加速レーン（時計回りに一周できる）
  w.addBoost(0, -98, 150, 5, 1, 0);
  w.addBoost(98, 0, 5, 150, 0, 1);
  w.addBoost(0, 98, 150, 5, -1, 0);
  w.addBoost(-98, 0, 5, 150, 0, -1);
  // 四隅のタワーとエレベーター
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tx = sx * 104, tz = sz * 104;
    w.addBox(tx, 0, tz, 16, 12, 16, w.matWall, { trim: 'magenta', midTrim: 6 });
    w.addBox(tx - sx * 5, 12, tz - sz * 5, 3, 1.2, 1.2, w.matCrate, { trim: 'amber' });
    w.addBox(tx, 12, tz - sz * 6.5, 6, 1.6, 1.2, w.matDark, { trim: 'cyan' });
    w.addBox(tx + sx * 2, 12, tz + sz * 2, 2, 14, 2, w.matDark, { trim: 'magenta' }); // アンテナ柱（グラップル用）
    const ex = tx - sx * 10.5, ez = tz;
    const ph = (sx + 2) * (sz + 3);
    w.addMover(4, 0.5, 4, w.matDark, (t) => [ex, (Math.sin(t * 0.7 + ph) * 0.5 + 0.5) * 11.6 - 0.1, ez], { trim: 'cyan' });
  }
  // 北：高架レールと動く台車
  w.addBox(0, 7, -110, 190, 0.6, 5, w.matDark, { trim: 'amber' });
  for (let x = -90; x <= 90; x += 20) w.addBox(x, 0, -110, 1, 7, 1, w.matDark);
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) w.addBox(sx * (103 - i * 1.2), 0, -106, 1.2, (i + 1) * 1.086, 3, w.matWall, { trim: i === 6 ? 'amber' : null });
  w.addMover(8, 0.7, 4, w.matCrate, (t) => [Math.sin(t * 0.22) * 80, 7.6, -110], { trim: 'amber' });
  // 南：浮遊プラットフォーム
  for (const [x0, ph] of [[-50, 0], [0, 2], [50, 4]]) {
    w.addMover(6, 0.6, 6, w.matDark, (t) => [x0 + Math.sin(t * 0.5 + ph) * 14, 5 + Math.sin(t * 0.9 + ph) * 1.2, 104], { trim: 'magenta' });
  }
  for (const x of [-80, 80]) w.addBox(x, 0, 104, 12, 5, 10, w.matWall, { trim: 'cyan', midTrim: 2.5 });
  w.addPad(-72, 98, 1, 0, 7, 17); w.addPad(72, 98, -1, 0, 7, 17);
  // 東西：回転レーザーとドラム缶ヤード
  w.addSweeper(98, -50, 12, { speed: 0.9 });
  w.addSweeper(-98, 50, 12, { speed: -0.8, phase: 1.5 });
  for (const [x, z] of [[92, 30], [93.2, 31.1], [91.6, 31.6], [104, 40], [-92, -30], [-93.1, -31.2], [-104, -42], [-103, -40.8], [30, 92], [31.2, 93], [-30, -92], [-31, -93.2], [104, -78], [-104, 78]]) w.addBarrel(x, z);
  // 外周の遮蔽物
  const ring = [[86, -30, 3, 2, 8], [86, 30, 3, 2, 8], [-86, 30, 3, 2, 8], [-86, -30, 3, 2, 8], [-30, 86, 8, 2, 3], [30, 86, 8, 2, 3], [-30, -86, 8, 2, 3], [30, -86, 8, 2, 3],
    [108, 0, 4, 3, 10], [-108, 0, 4, 3, 10], [60, 110, 10, 3, 4], [-60, 110, 10, 3, 4], [88, 60, 6, 4, 6], [-88, -60, 6, 4, 6], [60, -88, 6, 4, 6], [-60, 88, 6, 4, 6]];
  for (const [x, z, ww, h, d] of ring) w.addBox(x, 0, z, ww, h, d, w.matWall, { trim: 'cyan' });
  for (const [x, z] of [[96, 70], [-96, -70], [70, -96], [-70, 96], [112, 30], [-112, -30]]) { w.addBox(x, 0, z, 2.5, 2.6, 6.2, w.matCrate, { trim: 'amber' }); }

  // 看板
  w.sign('ECHO//BREAK', 'SECTOR-07  ·  NEON CITY', 0, 15, -S + 0.1, 0, 30, '#2fe6ff');
  w.sign('WARNING', 'HOSTILE UNITS DETECTED', 0, 15, S - 0.1, Math.PI, 24, '#ff2bd6');
  w.sign('ARENA 07', 'REWIND · REPLAY · DESTROY', -S + 0.1, 15, 0, Math.PI / 2, 24, '#ffb02e');
  w.sign('ECHO LINK', 'MEMORY BUFFER: 5.0 SEC', S - 0.1, 15, 0, -Math.PI / 2, 24, '#8c7bff');

  // 敵の出現位置
  spawnsFrom(w, [
    [-40, -15], [40, 15], [-40, 15], [40, -15], [-15, -40], [15, 40], [15, -40], [-15, 40],
    [0, -40], [0, 40], [-40, 0], [40, 0], [-28, 0], [28, 0], [0, -26], [0, 26],
    [-60, -60], [60, -60], [-60, 60], [60, 60], [0, -62], [0, 62], [-62, 0], [62, 0],
    [-30, -66], [30, -66], [-30, 66], [30, 66], [-66, -30], [66, -30], [-66, 30], [66, 30],
    [-95, -95], [95, -95], [-95, 95], [95, 95], [0, -92], [0, 92], [-92, 0], [92, 0], [50, -100], [-50, 100], [100, 50], [-100, -50],
  ]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.spawnPoints.push(V(sx * 30, 4, sz * 30));
  w.powerSpots = [[0, 5.01, 0], [-30, 4.01, -30], [30, 4.01, 30], [30, 4.01, -30], [-30, 4.01, 30], [0, 0, 20], [0, 0, -20],
    [-24, 0, 12], [24, 0, -12], [0, 3.01, 64], [61, 9.01, 10], [-54, 5.61, 0], [-12, 5.41, -60], [46, 8.11, -58], [56, 3.01, -36],
    [104, 12.01, 104], [-104, 12.01, -104], [104, 12.01, -104], [-104, 12.01, 104], [0, 7.61, -110], [-80, 5.01, 104], [80, 5.01, 104], [98, 0, -20], [-98, 0, 20]];

  // 空
  w.buildSky({ top: 0x020310, mid: 0x170830, hor: 0x9e2a7a, stars: 1 });
  const skyRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.25, 0.85).multiplyScalar(2.2), fog: false });
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(200, 1.6, 12, 220), skyRingMat);
  ringM.position.set(60, 140, -560); ringM.rotation.set(1.15, 0.2, 0.3);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(230, 0.6, 8, 220), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1.0).multiplyScalar(1.8), fog: false }));
  ring2.position.copy(ringM.position); ring2.rotation.copy(ringM.rotation);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 32), new THREE.MeshStandardMaterial({ color: 0x2a1840, emissive: 0x3a0a40, emissiveIntensity: 0.6, roughness: 0.8, fog: false }));
  planet.position.copy(ringM.position);
  w.root.add(ringM, ring2, planet);
  w.anim.push((t) => { ringM.rotation.z = 0.3 + t * 0.01; ring2.rotation.z = 0.3 - t * 0.007; });
  w.buildSkyline({ rMin: 150, rMax: 360, n: 200 });

  return { name: 'NEON CITY', B: S - 4, fog: 0x160b28, fogD: 0.0042, exposure: 0.88, bloom: 0.32, day: false, env: 0.32, spawn: [0, 5.01, 0], yaw: 0 };
}

// =====================================================================
// SKYLINE：青空の市街地。大通り・公園・工事現場・駅
// =====================================================================
function dayMats(w) {
  if (w._day) return w._day;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const asphalt = w.matFloor.clone(); asphalt.emissive = new THREE.Color(0); asphalt.emissiveMap = null; asphalt.color = new THREE.Color(0x4b4f57);
  const side = w.matFloor.clone(); side.emissive = new THREE.Color(0); side.emissiveMap = null; side.color = new THREE.Color(0xc2bdb2);
  const concrete = w.matWall.clone(); concrete.emissive = new THREE.Color(0); concrete.emissiveMap = null; concrete.color = new THREE.Color(0xd6d0c4);
  const steel = w.matDark.clone(); steel.color = new THREE.Color(0x7d8794);
  const brick = w.matCrate.clone(); brick.emissive = new THREE.Color(0); brick.emissiveMap = null; brick.color = new THREE.Color(0xc06a48);
  const facade = canvasTex(128, 256, (g, cw, ch) => {
    g.fillStyle = '#9fb3c6'; g.fillRect(0, 0, cw, ch);
    for (let y = 4; y < ch; y += 16) for (let x = 4; x < cw; x += 16) {
      const v = 150 + Math.random() * 80;
      g.fillStyle = `rgb(${v * 0.62},${v * 0.8},${v})`; g.fillRect(x, y, 12, 12);
      g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(x, y, 12, 2);
    }
  });
  facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
  const glass = std({ map: facade, color: 0xffffff, metalness: 0.55, roughness: 0.18 });
  const white = std({ color: 0xf1f1ee, roughness: 0.6 });
  const yellow = std({ color: 0xf2c230, roughness: 0.55 });
  const grass = std({ color: 0x5f9a3c, roughness: 0.95 });
  const leaf = std({ color: 0x4e8f36, roughness: 0.8, flatShading: true });
  const trunk = std({ color: 0x6b4a2f, roughness: 0.9 });
  const water = std({ color: 0x3d8fd1, metalness: 0.6, roughness: 0.08 });
  const cars = [0xd8423a, 0x2f6fd6, 0xf1f1ee, 0x2b2d33, 0xf2c230, 0x3aa36b].map((c) => std({ color: c, metalness: 0.6, roughness: 0.3 }));
  const tire = std({ color: 0x15161a, roughness: 0.9 });
  const glassDark = std({ color: 0x1c2733, metalness: 0.8, roughness: 0.1 });
  w._day = { asphalt, side, concrete, steel, brick, glass, white, yellow, grass, leaf, trunk, water, cars, tire, glassDark };
  return w._day;
}

function car(w, x, z, rot, mi, bus = false) {
  const m = dayMats(w);
  const L = bus ? 9 : 4.4, W = bus ? 2.6 : 1.9, H = bus ? 2.9 : 1.0;
  const along = rot ? [L, W] : [W, L];
  w.addBox(x, 0.35, z, along[0], H, along[1], m.cars[mi % m.cars.length]);
  if (!bus) w.addBox(x, 1.35, z, rot ? 2.2 : 1.7, 0.75, rot ? 1.7 : 2.2, m.glassDark);
  else w.addBox(x, 1.6, z, along[0] + 0.05, 0.9, along[1] + 0.05, m.glassDark, { collide: false });
  w.addCollider(x - along[0] / 2, 0, z - along[1] / 2, x + along[0] / 2, 0.35, z + along[1] / 2);
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const wx = rot ? x + a * (L / 2 - 0.8) : x + b * (W / 2 - 0.05), wz = rot ? z + b * (W / 2 - 0.05) : z + a * (L / 2 - 0.8);
    w.addBox(wx, 0, wz, rot ? 0.7 : 0.25, 0.7, rot ? 0.25 : 0.7, m.tire, { collide: false });
  }
}

function tree(w, x, z, s = 1) {
  const m = dayMats(w);
  w.addBox(x, 0, z, 0.45 * s, 2.6 * s, 0.45 * s, m.trunk);
  const geo = new THREE.IcosahedronGeometry(1.8 * s, 0);
  const crown = new THREE.Mesh(geo, m.leaf);
  crown.position.set(x, 3.6 * s, z); crown.castShadow = true;
  w.root.add(crown);
  const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 * s, 0), m.leaf);
  c2.position.set(x + 0.8 * s, 4.6 * s, z - 0.4 * s); c2.castShadow = true;
  w.root.add(c2);
}

function building(w, x, z, bw, bd, h, mat, opts = {}) {
  const m = dayMats(w);
  w.addBox(x, 0, z, bw, h, bd, mat || m.glass);
  w.addBox(x, h, z, bw + 0.4, 0.5, bd + 0.4, m.concrete); // 屋上のふち
  if (opts.roof !== false && h < 14) {
    w.addBox(x - bw / 2 + 0.3, h + 0.5, z, 0.3, 0.9, bd, m.concrete);
    w.addBox(x + bw / 2 - 0.3, h + 0.5, z, 0.3, 0.9, bd, m.concrete);
  }
  if (opts.ac) for (let i = 0; i < 2; i++) w.addBox(x - bw / 4 + i * bw / 2, h + 0.5, z + bd / 5, 2, 1.4, 2, m.steel);
}

function buildSkylineMap(w) {
  const S = 100;
  const m = dayMats(w);
  w.buildLights({ hemiSky: 0xcfe8ff, hemiGround: 0x6b5a48, hemiI: 1.15, sun: 0xfff0d8, sunI: 3.1, sunPos: [80, 140, 55], shadowR: 110 });

  floorPlane(w, S * 2, m.asphalt);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x7c8a6a, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05;
  w.root.add(outer);
  boundary(w, S, 5, m.concrete, null, null, 2.5);

  // 道路の白線
  const lineMat = m.white;
  for (let i = -92; i <= 92; i += 8) {
    if (Math.abs(i) < 12) continue;
    w.addBox(0, 0, i, 0.35, 0.02, 4, lineMat, { collide: false });
    w.addBox(i, 0, 0, 4, 0.02, 0.35, lineMat, { collide: false });
  }
  // 横断歩道
  for (const [cx, cz, rot] of [[0, -13, 0], [0, 13, 0], [-13, 0, 1], [13, 0, 1]]) {
    for (let k = -3; k <= 3; k++) {
      if (rot) w.addBox(cx, 0, cz + k * 1.6, 3.5, 0.025, 0.8, lineMat, { collide: false });
      else w.addBox(cx + k * 1.6, 0, cz, 0.8, 0.025, 3.5, lineMat, { collide: false });
    }
  }
  // 歩道（区画ごとの縁石）
  const blocks = [[9, 57], [63, 97]];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const [ax, bx] of blocks) for (const [az, bz] of blocks) {
    const cx = sx * (ax + bx) / 2, cz = sz * (az + bz) / 2;
    w.addBox(cx, 0, cz, bx - ax, 0.22, bz - az, m.side, { collide: true });
  }

  // ---- 中央：ロータリーの噴水 ----
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    w.addBox(Math.cos(a) * 5.2, 0, Math.sin(a) * 5.2, 2.2, 0.8, 2.2, m.concrete);
  }
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.5, 32), m.water); pool.position.set(0, 0.3, 0); w.root.add(pool);
  w.addBox(0, 0, 0, 1.4, 4, 1.4, m.white, { trim: null });
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.6, 3, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.5, depthWrite: false }));
  jet.position.set(0, 5.4, 0); w.root.add(jet);
  w.anim.push((t) => { jet.scale.y = 1 + Math.sin(t * 3) * 0.15; });

  // ---- 大通りの車（遮蔽物） ----
  const carList = [[4, -30, 0, 0], [-4, -46, 0, 1], [4, -70, 0, 2, true], [-4, 28, 0, 3], [4, 44, 0, 4], [-4, 76, 0, 5],
    [-30, 4, 1, 1], [-52, -4, 1, 2, true], [-80, 4, 1, 0], [28, -4, 1, 3], [46, 4, 1, 5], [78, -4, 1, 2, true], [-60, 60, 1, 4], [60, -60, 0, 1]];
  for (const [x, z, r, mi, bus] of carList) car(w, x, z, r, mi, bus);
  // 加速レーン（大通り）
  w.addBoost(-4.5, -55, 3, 70, 0, -1);
  w.addBoost(4.5, 55, 3, 70, 0, 1);
  w.addBoost(55, 4.5, 70, 3, 1, 0);
  w.addBoost(-55, -4.5, 70, 3, -1, 0);

  // ---- 北西（-x,-z）：ダウンタウン（高層ビル・屋上ルート） ----
  building(w, -22, -22, 16, 14, 34);
  building(w, -46, -20, 14, 12, 6, m.concrete, { ac: true });
  building(w, -22, -46, 12, 16, 8, m.brick, { ac: true });
  building(w, -47, -46, 14, 14, 26);
  building(w, -78, -22, 16, 12, 10, m.concrete, { ac: true });
  building(w, -80, -48, 14, 16, 40);
  building(w, -26, -80, 18, 14, 22);
  building(w, -56, -80, 14, 14, 5, m.brick, { ac: true });
  building(w, -84, -84, 14, 14, 48);
  // 屋上どうしの橋とエレベーター
  w.addBox(-34, 6, -20, 10, 0.5, 3, m.steel, { trim: null });
  w.addBox(-22, 8, -33.5, 3, 0.5, 9, m.steel);
  w.addMover(3.5, 0.5, 3.5, m.steel, (t) => [-38, (Math.sin(t * 0.8) * 0.5 + 0.5) * 6, -10.5], { trim: 'amber' });
  w.addMover(3.5, 0.5, 3.5, m.steel, (t) => [-66, (Math.sin(t * 0.7 + 2) * 0.5 + 0.5) * 10, -22], { trim: 'amber' });
  w.addPad(-60, -60, -1, 0, 6, 14);
  w.addPad(-34, -62, 0, 1, 6, 15);

  // ---- 北東（+x,-z）：駅（高架ホームと走る電車） ----
  w.addBox(58, 7, -82, 76, 0.6, 9, m.concrete, { trim: null });               // ホーム
  for (let x = 24; x <= 92; x += 12) w.addBox(x, 0, -82, 1.2, 7, 1.2, m.steel);
  w.addBox(58, 11.5, -82, 76, 0.4, 9, m.steel, { collide: false });            // 屋根
  for (let x = 24; x <= 92; x += 17) w.addBox(x, 7.6, -85.8, 0.4, 3.9, 0.4, m.steel, { collide: false });
  // 階段
  for (let i = 0; i < 12; i++) w.addBox(30, 0, -66.5 - i, 3.2, 0.63 * (i + 1), 1, m.concrete);
  // 電車（ホームの横を往復する。屋根に乗れる）
  w.addBox(58, 0, -89.5, 90, 0.4, 4, m.steel, { collide: false });             // 線路
  const train = w.addMover(22, 3.6, 3.4, m.cars[1], (t) => [58 + Math.sin(t * 0.18) * 30, 0.4, -89.5], { trim: 'amber' });
  const tw = new THREE.Mesh(new THREE.BoxGeometry(22.05, 1, 3.45), m.glassDark); tw.position.y = 2.4; train.mesh.add(tw);
  // 改札のセキュリティゲート（レーザー）
  w.addLaser(30, -63.6, 4, 'x', { on: 1.6, off: 2.2 });
  w.addLaser(48, -70, 6, 'x', { on: 1.6, off: 2.2, phase: 1.9 });
  // ガソリンスタンドとドラム缶
  w.addBox(80, 4.5, -36, 18, 0.5, 12, m.white, { collide: false });
  for (const [x, z] of [[73, -32], [87, -32], [73, -40], [87, -40]]) w.addBox(x, 0.22, z, 0.6, 4.3, 0.6, m.steel);
  for (const [x, z] of [[78, -36], [82, -36]]) w.addBox(x, 0.22, z, 1.2, 1.8, 2.2, m.white);
  for (const [x, z] of [[92, -46], [93.1, -47.1], [91.4, -47.6], [70, -46], [64, -30], [65.1, -31]]) w.addBarrel(x, z, 0.22);
  building(w, 34, -36, 14, 14, 18);
  building(w, 34, -20, 10, 8, 5, m.brick, { ac: true });

  // ---- 南西（-x,+z）：公園 ----
  for (const [ax, bx] of blocks) for (const [az, bz] of blocks) {
    const cx = -(ax + bx) / 2, cz = (az + bz) / 2;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(bx - ax - 2, bz - az - 2), m.grass);
    g.rotation.x = -Math.PI / 2; g.position.set(cx, 0.235, cz); g.receiveShadow = true; w.root.add(g);
  }
  for (const [x, z, s] of [[-20, 20, 1.2], [-34, 16, 1], [-48, 24, 1.3], [-18, 44, 1.1], [-42, 48, 1.2], [-70, 20, 1.4], [-88, 30, 1], [-74, 44, 1.1],
    [-20, 74, 1.2], [-40, 88, 1.3], [-66, 70, 1], [-86, 84, 1.4], [-52, 70, 1.1], [-26, 92, 1]]) tree(w, x, z, s);
  // 小高い丘（段々）
  for (let i = 0; i < 4; i++) w.addBox(-33, 0.22, 33, 14 - i * 3, 0.6 * (i + 1), 14 - i * 3, m.grass);
  w.addBox(-33, 2.62, 33, 2.4, 0.8, 2.4, m.white);
  // ベンチ・池
  for (const [x, z, r] of [[-60, 36, 0], [-24, 60, 1], [-80, 62, 0]]) w.addBox(x, 0.22, z, r ? 0.8 : 3, 0.6, r ? 3 : 0.8, m.trunk);
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.1, 28), m.water); pond.position.set(-76, 0.26, 78); w.root.add(pond);
  w.addPad(-52, 52, 1, 0, 7, 15);

  // ---- 南東（+x,+z）：工事現場（鉄骨の足場とクレーン） ----
  const F = (x, z) => w.addBox(x, 0.22, z, 0.6, 12, 0.6, m.yellow);
  for (const x of [22, 38, 54]) for (const z of [22, 38]) F(x, z);
  w.addBox(38, 4, 30, 34, 0.4, 18, m.steel, { trim: 'amber' });   // 2階
  w.addBox(30, 8, 30, 18, 0.4, 18, m.steel, { trim: 'amber' });   // 3階
  for (let i = 0; i < 8; i++) w.addBox(56, 0.22 + i * 0.5, 22 + i * 0.95, 4, 0.4, 0.95, m.steel); // 階段
  w.addMover(3.5, 0.4, 3.5, m.yellow, (t) => [18.6, (Math.sin(t * 0.6) * 0.5 + 0.5) * 8 + 0.22, 30], { trim: 'amber' });
  // クレーンと吊り荷（動く足場）
  w.addBox(80, 0.22, 80, 2, 30, 2, m.yellow);
  w.addBox(70, 30, 80, 34, 1.4, 1.6, m.yellow, { collide: false });
  w.addMover(5, 0.5, 5, m.steel, (t) => [72 + Math.sin(t * 0.3) * 16, 10 + Math.sin(t * 0.6) * 3, 80], { trim: 'amber' });
  for (const [x, z] of [[44, 60], [45.2, 61], [43.6, 61.4], [90, 50], [66, 66]]) w.addBarrel(x, z, 0.22);
  for (const [x, z] of [[24, 60, 0], [40, 84], [90, 92], [70, 50]]) w.addBox(x, 0.22, z, 2.5, 2.6, 6.2, m.brick, { trim: null });
  building(w, 84, 30, 14, 14, 14, m.concrete, { ac: true });
  building(w, 22, 84, 16, 14, 28);

  // 周りのビル（外側の景色）
  for (let i = -100; i <= 100; i += 20) {
    const hh = 24 + ((i * 7919) % 40 + 40) % 40;
    for (const [x, z] of [[i, -S - 14], [i, S + 14], [-S - 14, i], [S + 14, i]]) building(w, x, z, 18, 18, hh, m.glass, { roof: false });
  }
  w.sign('SKYLINE', 'DISTRICT 02  ·  DAYLIGHT OPS', 0, 30, -S - 4.9, 0, 30, '#2f6fd6');

  spawnsFrom(w, [[0, -40], [0, 40], [-40, 0], [40, 0], [0, -86], [0, 86], [-86, 0], [86, 0], [-60, 0], [60, 0], [0, -60], [0, 60],
    [-60, -60, 0.22], [60, 60, 0.22], [-30, 30, 0.22], [30, 60, 0.22], [60, -30, 0.22], [-30, -60, 0.22], [-90, 60, 0.22], [90, -60, 0.22], [-60, 90, 0.22], [60, -90, 0.22],
    [-18, -8], [18, 8], [8, -18], [-8, 18], [-90, -8], [90, 8]]);
  w.powerSpots = [[0, 0, 12], [-46, 6.51, -20], [-22, 8.51, -46], [58, 7.61, -82], [38, 4.41, 30], [30, 8.41, 30], [-33, 3.42, 33], [-78, 10.51, -22], [80, 0.22, -36], [0, 0, -50], [50, 0, 0]];

  w.buildSky({ top: 0x2a66cf, mid: 0x6ea6e8, hor: 0xd8ecf8, stars: 0, day: true, sunDir: [0.45, 0.62, 0.3] });
  w.buildSkyline({ rMin: 150, rMax: 340, n: 140, day: true });

  return { name: 'SKYLINE', B: S - 4, fog: 0xbfd8ee, fogD: 0.0034, exposure: 1.0, bloom: 0.12, day: true, env: 0.85, spawn: [0, 0.01, 30], yaw: 0 };
}

// =====================================================================
// CORE ARENA：ボス専用ステージ。沈んだり出てきたりする柱と、回転レーザー
// =====================================================================
function buildCore(w) {
  const S = 56;
  w.buildLights({ hemiSky: 0xffb0c0, hemiGround: 0x3a1018, hemiI: 1.0, sun: 0xffc4b4, sunI: 2.4, sunPos: [30, 80, 20], shadowR: 70, rim: 0xff2244, rimI: 0.6 });
  const core = new THREE.PointLight(0xff2b4a, 18, 45, 1.5); core.position.set(0, 10, 0); w.root.add(core);
  w.coreLight = core;
  const dark = w.matDark.clone(); dark.color = new THREE.Color(0x3a3440);
  floorPlane(w, S * 2, w.matFloor);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x0c0306, roughness: 0.9 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; w.root.add(outer);
  boundary(w, S, 16, w.matWall, 'magenta', 'magenta', 6);
  // 角を斜めにふさぐ
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.addBox(sx * (S - 7), 0, sz * (S - 7), 14, 16, 14, w.matDark, { trim: 'magenta' });

  // 外周の高い通路（4辺）
  for (const sx of [-1, 1]) {
    w.addBox(sx * (S - 5), 0, 0, 8, 3, 62, w.matWall, { trim: 'amber', midTrim: 1.5 });
    w.addBox(0, 0, sx * (S - 5), 62, 3, 8, w.matWall, { trim: 'amber', midTrim: 1.5 });
  }
  w.addPad(S - 14, 0, 1, 0, 6, 15); w.addPad(-S + 14, 0, -1, 0, 6, 15); w.addPad(0, S - 14, 0, 1, 6, 15); w.addPad(0, -S + 14, 0, -1, 6, 15);

  // 沈む柱（8本）：上がっているときは遮蔽物になる
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 26, z = Math.sin(a) * 26;
    const ph = k * 0.8;
    w.addMover(3.2, 6, 3.2, dark, (t) => {
      const c = (Math.sin(t * 0.45 + ph) * 0.5 + 0.5);
      return [x, -5.9 + Math.min(1, c * 1.6) * 5.9, z];
    }, { trim: 'magenta' });
  }
  // 低い遮蔽物
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    w.addBox(Math.cos(a) * 38, 0, Math.sin(a) * 38, k % 2 ? 6 : 2, 1.6, k % 2 ? 2 : 6, w.matWall, { trim: 'cyan' });
  }
  // 中央：回転レーザー（ジャンプでかわす）
  w.addSweeper(0, 0, 20, { speed: 0.75, y: 0.65 });
  // ドラム缶
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.3; w.addBarrel(Math.cos(a) * 32, Math.sin(a) * 32); }
  // 演出：空中の巨大な輪とコア
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.15, 0.3).multiplyScalar(2.2) });
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(16, 0.25, 8, 120), ringMat); r1.position.set(0, 22, 0); r1.rotation.x = Math.PI / 2;
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(20, 0.12, 8, 120), w.trimMats.magenta); r2.position.set(0, 24, 0); r2.rotation.x = Math.PI / 2;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), new THREE.MeshStandardMaterial({ color: 0x220008, emissive: 0xff2244, emissiveIntensity: 1.6, flatShading: true }));
  orb.position.set(0, 26, 0);
  w.root.add(r1, r2, orb);
  w.anim.push((t) => { r1.rotation.z = t * 0.2; r2.rotation.z = -t * 0.12; r2.rotation.x = Math.PI / 2 + Math.sin(t * 0.3) * 0.2; orb.rotation.y = t * 0.6; orb.position.y = 26 + Math.sin(t) * 0.6; });
  // 四隅のパイロン
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    w.addVStrip(sx * (S - 7) + sx * -7.05, 0.5, 15.5, sz * (S - 7), 'magenta');
  }
  w.sign('WARDEN', 'CORE ARENA  ·  BOSS ZONE', 0, 11, -S + 0.1, 0, 30, '#ff2b4a');
  w.sign('NO RETREAT', 'SURVIVE THE CORE', 0, 11, S - 0.1, Math.PI, 24, '#ffb02e');

  spawnsFrom(w, [[0, -34], [34, 0], [0, 34], [-34, 0], [24, -24], [-24, 24], [24, 24], [-24, -24], [0, -44], [0, 44], [44, 0], [-44, 0], [12, -16], [-12, 16]]);
  w.powerSpots = [[0, 0, 30], [0, 0, -30], [30, 0, 0], [-30, 0, 0], [S - 5, 3.01, 0], [-S + 5, 3.01, 0], [0, 3.01, S - 5], [0, 3.01, -S + 5]];

  w.buildSky({ top: 0x0a0208, mid: 0x3a0616, hor: 0xb02a3c, stars: 0.35 });
  w.buildSkyline({ rMin: 110, rMax: 300, n: 120 });
  return { name: 'CORE ARENA', B: S - 4, fog: 0x3a0a18, fogD: 0.0052, exposure: 1.05, bloom: 0.38, day: false, env: 0.32, spawn: [0, 0.01, 44], yaw: 0 };
}

export const MAPS = {
  neon: { name: 'NEON CITY', sub: '夜のサイバー都市・236m', build: buildNeon },
  skyline: { name: 'SKYLINE', sub: '青空の市街地・200m', build: buildSkylineMap },
  core: { name: 'CORE ARENA', sub: 'ボス専用ステージ', build: buildCore },
};
