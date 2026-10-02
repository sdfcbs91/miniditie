/* src/js/core/audio.js
 * 以经典 <script> 加载（非 ES Module），与其它模块共享全局作用域。
 * ⚠ 顶层标识符不可与其它模块重名 —— 新增模块前请先查 README「命名与加载顺序」。
 */
'use strict';
/**
 * 程序化音效（WebAudio 振荡器合成，无外部音频资源）
 * 浏览器要求首次用户手势后才能播声音，所以 init() 在开场按钮 / 首次点击时调用。
 */

const AU = {
  ctx: null,
  muted: false,
  combo: 0,
  lastD: 0,

  init() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) { /* 无音频环境时静默降级 */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  /** 单个音符：频率 / 时长 / 波形 / 音量 / 延迟 */
  tone(f, d = 0.12, type = 'sine', v = 0.15, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + d + 0.05);
  },

  tick()    { this.tone(700, 0.05, 'sine', 0.06); },

  /** 送达乘客：1.4s 内连续送达会升调（最多 12 连） */
  deliver() {
    const now = performance.now();
    if (now - this.lastD < 1400) this.combo = Math.min(this.combo + 1, 12);
    else this.combo = 0;
    this.lastD = now;
    this.tone(460 * Math.pow(2, this.combo / 12), 0.1, 'triangle', 0.13);
  },

  station() { this.tone(196, 0.18, 'sine', 0.14); this.tone(294, 0.12, 'sine', 0.07, 0.03); },
  deny()    { this.tone(130, 0.16, 'square', 0.09); },
  chime()   { [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.11, i * 0.07)); },
  over()    { [392, 311, 247, 165].forEach((f, i) => this.tone(f, 0.32, 'sine', 0.13, i * 0.17)); }
};
