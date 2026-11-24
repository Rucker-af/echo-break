// キャラクター（アバター）定義：武器2つ・スキル・必殺技・ECHOの個性
// weapons は WEAPONS の番号（0 ライフル / 1 ショットガン / 2 レールガン / 3 ランチャー / 4 アーク）
export const CHARACTERS = [
  {
    id: 'vector', name: 'VECTOR', kana: 'ヴェクター', role: '突撃', color: 0x3ee8ff,
    hp: 100, speed: 1.0, weapons: [0, 1], dashMax: 3, grappleCD: 4.5,
    skill: 'shock', skillName: 'ショックウェーブ', skillCD: 7, shockPower: 1,
    ult: 'overdrive', ultName: 'オーバードライブ', ultDesc: '6秒間、連射・リロード・移動が速くなる',
    echoName: 'ダブルタップ', echoDesc: 'エコーの射撃が1.5倍の手数になる',
    desc: 'ダッシュを3回分ためられる切り込み役。',
  },
  {
    id: 'haken', name: 'HAKEN', kana: 'ハーケン', role: '機動', color: 0x9d7bff,
    hp: 90, speed: 1.08, weapons: [4, 1], dashMax: 2, grappleCD: 2.0,
    skill: 'shock', skillName: 'ショックウェーブ', skillCD: 8, shockPower: 0.8,
    ult: 'meteor', ultName: 'メテオダイブ', ultDesc: '空高く跳び上がり、真下へ急降下して周囲を吹き飛ばす',
    echoName: 'アークエコー', echoDesc: 'エコーが消えるとき、周りの敵へ電撃が連鎖する',
    desc: 'フックの再使用が速い空中戦のスペシャリスト。',
  },
  {
    id: 'nox', name: 'NOX', kana: 'ノクス', role: '狙撃', color: 0xff3ad8,
    hp: 90, speed: 1.0, weapons: [2, 0], dashMax: 2, grappleCD: 4.5,
    skill: 'scan', skillName: 'スキャン', skillCD: 10,
    ult: 'chrono', ultName: 'クロノフィールド', ultDesc: '5秒間、敵と敵の弾がスローになる',
    echoName: 'ロックオン', echoDesc: 'エコーの狙いがとても正確になる',
    desc: '壁の向こうの敵を暴き、遠くから仕留める。',
  },
  {
    id: 'boulder', name: 'BOULDER', kana: 'ボルダー', role: '重装', color: 0xffb02e,
    hp: 150, speed: 0.9, weapons: [3, 1], dashMax: 2, grappleCD: 5.5,
    skill: 'shock', skillName: 'ヘヴィショック', skillCD: 7, shockPower: 1.5,
    ult: 'bulwark', ultName: 'バルワーク', ultDesc: '前方に敵の弾を防ぐ盾を8秒間張る',
    echoName: 'ビッグバン', echoDesc: 'エコーの最後の爆発が大きくなる',
    desc: 'HP150。爆発物で前線を押し上げる。',
  },
];

// チュートリアル用：全武器を使える
export const TRAINEE = Object.assign({}, CHARACTERS[0], { id: 'trainee', weapons: [0, 1, 2, 3, 4] });

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}
