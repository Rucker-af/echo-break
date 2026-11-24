// 入力：キーボード / マウス / タッチを「アクション名」にまとめる
const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyC: 'slide', ControlLeft: 'slide',
  KeyE: 'grapple', KeyF: 'shock', KeyQ: 'echo', KeyR: 'reload',
  Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', Digit5: 'w5',
  KeyV: 'ads', KeyX: 'ult',
  KeyP: 'pause',
};

export class Input {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.isTouch = game.isTouch;
    this.down = new Set();
    this.pressedSet = new Set();
    this.lookDX = 0; this.lookDY = 0; this.wheel = 0;
    this.move = { x: 0, y: 0 };
    this.enabled = false;
    this.locked = false;
    this.adsToggle = false;
    this.touches = new Map();
    this.joyId = null;
    this.joyBase = document.getElementById('joyBase');
    this.joyKnob = document.getElementById('joyKnob');

    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a || !this.enabled) return;
      e.preventDefault();
      if (!e.repeat) this.press(a);
    });
    addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.release(a); });
    addEventListener('blur', () => this.reset());
    document.addEventListener('mousedown', (e) => {
      if (!this.enabled || !this.locked) return;
      if (e.button === 0) this.press('fire');
      if (e.button === 2) this.press('ads');
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.release('fire');
      if (e.button === 2) this.release('ads');
    });
    addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (Math.abs(mx) > 300 || Math.abs(my) > 300) return; // ブラウザの異常値を捨てる
      this.lookDX += mx; this.lookDY += my;
    });
    addEventListener('wheel', (e) => { if (this.enabled) this.wheel += Math.sign(e.deltaY); }, { passive: true });

    const opt = { passive: false };
    addEventListener('touchstart', (e) => this.onTouchStart(e), opt);
    addEventListener('touchmove', (e) => this.onTouchMove(e), opt);
    addEventListener('touchend', (e) => this.onTouchEnd(e), opt);
    addEventListener('touchcancel', (e) => this.onTouchEnd(e), opt);
  }

  press(a) {
    if (a === 'ads' && !this.isTouch && this.game.settings.adsMode === 'toggle' && !this.down.has(a)) this.adsToggle = !this.adsToggle;
    if (!this.down.has(a)) this.pressedSet.add(a);
    this.down.add(a);
  }
  release(a) { this.down.delete(a); }
  isDown(a) { return this.down.has(a); }
  pressed(a) { return this.pressedSet.has(a); }
  adsActive() { return this.isTouch || this.game.settings.adsMode === 'toggle' ? this.adsToggle : this.down.has('ads'); }
  axisX() {
    let v = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0) + this.move.x;
    return Math.max(-1, Math.min(1, v));
  }
  axisY() {
    let v = (this.down.has('fwd') ? 1 : 0) - (this.down.has('back') ? 1 : 0) + this.move.y;
    return Math.max(-1, Math.min(1, v));
  }
  reset() {
    this.down.clear(); this.pressedSet.clear();
    this.move.x = this.move.y = 0; this.adsToggle = false;
    this.touches.clear(); this.joyId = null;
    if (this.joyBase) this.joyBase.classList.remove('on');
    document.querySelectorAll('[data-action].active').forEach((el) => el.classList.remove('active'));
  }
  endFrame() { this.pressedSet.clear(); this.lookDX = 0; this.lookDY = 0; this.wheel = 0; }

  // ---- タッチ ----
  onTouchStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const btn = t.target && t.target.closest ? t.target.closest('[data-action]') : null;
      if (btn) {
        const a = btn.dataset.action;
        btn.classList.add('active');
        this.touches.set(t.identifier, { kind: 'btn', action: a, el: btn, x: t.clientX, y: t.clientY });
        if (a === 'ads') this.adsToggle = !this.adsToggle;
        else if (a === 'pause') this.game.pause();
        else this.press(a);
      } else if (t.clientX < innerWidth * 0.42 && this.joyId === null) {
        this.joyId = t.identifier;
        this.touches.set(t.identifier, { kind: 'joy', ox: t.clientX, oy: t.clientY });
        this.joyBase.style.left = t.clientX + 'px';
        this.joyBase.style.top = t.clientY + 'px';
        this.joyBase.classList.add('on');
        this.joyKnob.style.transform = 'translate(-50%,-50%)';
      } else {
        this.touches.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
      }
    }
  }
  onTouchMove(e) {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const info = this.touches.get(t.identifier);
      if (!info) continue;
      if (info.kind === 'joy') {
        let dx = t.clientX - info.ox, dy = t.clientY - info.oy;
        const R = 56, len = Math.hypot(dx, dy);
        if (len > R) { dx *= R / len; dy *= R / len; }
        this.move.x = dx / R; this.move.y = -dy / R;
        this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (info.kind === 'look' || (info.kind === 'btn' && info.action === 'fire')) {
        this.lookDX += t.clientX - info.x; this.lookDY += t.clientY - info.y;
        info.x = t.clientX; info.y = t.clientY;
      }
    }
  }
  onTouchEnd(e) {
    for (const t of e.changedTouches) {
      const info = this.touches.get(t.identifier);
      if (!info) continue;
      if (info.kind === 'btn') { info.el.classList.remove('active'); if (info.action !== 'ads') this.release(info.action); }
      else if (info.kind === 'joy') {
        this.joyId = null; this.move.x = this.move.y = 0;
        this.joyBase.classList.remove('on');
      }
      this.touches.delete(t.identifier);
    }
    if (this.enabled) e.preventDefault();
  }
}
