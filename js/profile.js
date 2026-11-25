// プレイヤーの記録：レベル・経験値・ミッション・戦績（ブラウザの localStorage に保存）
const KEY = 'eb_profile';

export const MISSION_POOL = [
  { id: 'kills', text: '敵を40体倒す', target: 40, xp: 400, ev: 'kill' },
  { id: 'heads', text: 'ヘッドショットで12体倒す', target: 12, xp: 500, ev: 'head' },
  { id: 'echo', text: 'ECHOで6体倒す', target: 6, xp: 600, ev: 'echoKill' },
  { id: 'wave', text: '1試合でウェーブ6に到達', target: 6, xp: 700, ev: 'wave', max: true },
  { id: 'boss', text: 'ボス「ウォーデン」を倒す', target: 1, xp: 800, ev: 'boss' },
  { id: 'rusher', text: 'ラッシャーを10体倒す', target: 10, xp: 400, ev: 'rusher' },
  { id: 'ult', text: '必殺技を6回使う', target: 6, xp: 400, ev: 'ult' },
  { id: 'powerup', text: 'パワーアップを4個取る', target: 4, xp: 350, ev: 'powerup' },
  { id: 'multi', text: 'DOUBLE KILL以上を6回出す', target: 6, xp: 500, ev: 'multi' },
  { id: 'drone', text: 'ドローンを15機落とす', target: 15, xp: 400, ev: 'drone' },
  { id: 'streak', text: '死なずに10体倒す（RAMPAGE）', target: 10, xp: 600, ev: 'streak', max: true },
];

export const TITLES = [[1, 'ルーキー'], [3, 'ランナー'], [6, 'ブレイカー'], [10, 'エコーマスター'], [15, 'タイムリッパー'], [20, 'レジェンド']];

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
}

export class Profile {
  constructor() {
    const d = load() || {};
    this.name = d.name || 'AGENT';
    this.level = d.level || 1;
    this.xp = d.xp || 0;
    this.stats = Object.assign({ matches: 0, kills: 0, heads: 0, echoKills: 0, bosses: 0, bestWave: 0, bestScore: 0, bestStreak: 0, playSec: 0, chars: {} }, d.stats || {});
    this.loadout = d.loadout || {}; // キャラごとのサブ武器（WEAPONSの番号）
    this.newWeapons = d.newWeapons || []; // 解放されたがまだ装備画面で見ていない武器
    this.missions = (d.missions || []).filter((m) => MISSION_POOL.some((p) => p.id === m.id));
    this.fill();
    this.match = null;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ name: this.name, level: this.level, xp: this.xp, stats: this.stats, missions: this.missions, loadout: this.loadout, newWeapons: this.newWeapons }));
    } catch (e) { /* 保存できない環境 */ }
  }

  need(level = this.level) { return 500 + (level - 1) * 250; }
  title() { let t = TITLES[0][1]; for (const [lv, name] of TITLES) if (this.level >= lv) t = name; return t; }

  fill() {
    while (this.missions.length < 3) {
      const used = new Set(this.missions.map((m) => m.id));
      const cand = MISSION_POOL.filter((p) => !used.has(p.id));
      const p = cand[Math.floor(Math.random() * cand.length)];
      this.missions.push({ id: p.id, progress: 0 });
    }
  }

  def(m) { return MISSION_POOL.find((p) => p.id === m.id); }

  // 試合の開始と終わり
  startMatch(charId) { this.match = { charId, completed: [], start: performance.now() }; }

  onEvent(name, data = {}) {
    if (!this.match) return;
    const map = { kill: [], wave: ['wave'], ult: ['ult'], powerup: ['powerup'], multi: ['multi'], streak: ['streak'] };
    let evs = map[name] || [];
    if (name === 'kill') {
      if (data.type === 'dummy') return;
      evs = ['kill'];
      if (data.head) evs.push('head');
      if (data.owner === 'echo') evs.push('echoKill');
      if (data.type === 'boss') evs.push('boss');
      if (data.type === 'rusher') evs.push('rusher');
      if (data.type === 'drone') evs.push('drone');
    }
    for (const m of this.missions) {
      const d = this.def(m);
      if (!evs.includes(d.ev) || m.progress >= d.target) continue;
      if (d.max) m.progress = Math.max(m.progress, data.value || 0);
      else m.progress++;
      if (m.progress >= d.target) this.match.completed.push(d);
    }
  }

  // 結果：獲得経験値などを返す
  endMatch(stats, score, mode) {
    if (!this.match) return null;
    const s = this.stats;
    s.matches++; s.kills += stats.kills; s.heads += stats.heads; s.echoKills += stats.echoKills;
    s.bosses += stats.bosses || 0;
    s.bestWave = Math.max(s.bestWave, stats.wave); s.bestScore = Math.max(s.bestScore, score);
    s.bestStreak = Math.max(s.bestStreak, stats.bestStreak || 0);
    s.playSec += Math.round((performance.now() - this.match.start) / 1000);
    s.chars[this.match.charId] = (s.chars[this.match.charId] || 0) + 1;
    const base = mode === 'tutorial' ? 300 : Math.round(score / 8) + stats.wave * 40 + stats.kills * 5;
    const mission = this.match.completed.reduce((a, d) => a + d.xp, 0);
    const before = { level: this.level, xp: this.xp };
    this.addXp(base + mission);
    const done = this.match.completed;
    this.missions = this.missions.filter((m) => m.progress < this.def(m).target);
    this.fill();
    this.match = null;
    this.save();
    return { base, mission, total: base + mission, done, before, after: { level: this.level, xp: this.xp }, levelUp: this.level > before.level };
  }

  addXp(n) {
    this.xp += n;
    while (this.xp >= this.need()) { this.xp -= this.need(); this.level++; }
  }
}
