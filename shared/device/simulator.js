import { Emitter } from './emitter.js';

const G = 1024; // 마이크로비트에서 중력 1g ≈ 1024
const INTERVAL_MS = 20; // 50Hz

// 마이크로비트가 없을 때 쓰는 연습용 가짜 센서.
// 네모 판 위에서 마우스를 움직이면 "기울이기"가 되고, 빨리 움직이면 "흔들기"가 된다.
export class SimulatorDevice extends Emitter {
  kind = 'simulator';
  #pad;
  #timer = null;
  #target = { x: 0, y: 0 }; // 기울기(-1~1)
  #lastTarget = { x: 0, y: 0 };
  #boost = { x: 0, y: 0 }; // 마우스 속도로 생기는 흔들림

  constructor(padEl) {
    super();
    this.#pad = padEl;
    this.#pad.addEventListener('pointermove', (e) => {
      const r = this.#pad.getBoundingClientRect();
      this.#target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.#target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    this.#pad.addEventListener('pointerleave', () => {
      this.#target = { x: 0, y: 0 };
    });
  }

  get connected() {
    return this.#timer !== null;
  }

  async connect() {
    this.#timer = setInterval(() => this.#tick(), INTERVAL_MS);
    this.emit('status', { state: 'connected' });
  }

  async disconnect() {
    clearInterval(this.#timer);
    this.#timer = null;
    this.emit('status', { state: 'disconnected' });
  }

  async send(line) {
    this.emit('command', line);
  }

  #tick() {
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const dx = this.#target.x - this.#lastTarget.x;
    const dy = this.#target.y - this.#lastTarget.y;
    this.#lastTarget = { ...this.#target };
    // 속도가 빠를수록 흔들림이 커지고, 천천히 사라진다.
    this.#boost.x = this.#boost.x * 0.85 + dx * 6 * G;
    this.#boost.y = this.#boost.y * 0.85 + dy * 6 * G;

    const tx = clamp(this.#target.x) * G * 0.9;
    const ty = clamp(this.#target.y) * G * 0.9;
    const noise = () => (Math.random() - 0.5) * 30;
    const x = Math.round(tx + this.#boost.x + noise());
    const y = Math.round(ty + this.#boost.y + noise());
    // 판판하게 놓으면 z ≈ -1024 (기울이면 중력이 x, y로 나뉜다)
    const flat = Math.max(0, G * G - tx * tx - ty * ty);
    const z = Math.round(-Math.sqrt(flat) + noise());
    this.emit('sample', { t: performance.now(), x, y, z });
  }
}
