// 센서 3개(x, y, z)를 실시간 선 그래프로 그린다. 최근 4초(200개)만 보여 준다.
// series로 그릴 선을 바꿀 수 있고, setLines로 가로 기준선(점선)을 그릴 수 있다.
const DEFAULT_SERIES = [
  { key: 'x', color: '#ef4444' },
  { key: 'y', color: '#16a34a' },
  { key: 'z', color: '#3b82f6' },
];

export class LiveChart {
  #canvas;
  #ctx;
  #max;
  #range;
  #series;
  #data = {};
  #lines = [];
  #dirty = true;
  #w = 0;
  #h = 0;
  #observer;
  #raf = 0;

  constructor(canvas, { maxPoints = 200, range = 2048, series = DEFAULT_SERIES } = {}) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#max = maxPoints;
    this.#range = range;
    this.#series = series;
    this.clear();
    this.#observer = new ResizeObserver(() => this.#resize());
    this.#observer.observe(canvas);
    this.#resize();
    const loop = () => {
      if (this.#dirty) {
        this.#draw();
        this.#dirty = false;
      }
      this.#raf = requestAnimationFrame(loop);
    };
    this.#raf = requestAnimationFrame(loop);
  }

  // 모드를 떠날 때 호출해서 그리기를 멈춘다.
  destroy() {
    cancelAnimationFrame(this.#raf);
    this.#observer.disconnect();
  }

  push(sample) {
    for (const { key } of this.#series) {
      const arr = this.#data[key];
      arr.push(sample[key]);
      if (arr.length > this.#max) arr.shift();
    }
    this.#dirty = true;
  }

  clear() {
    for (const { key } of this.#series) this.#data[key] = [];
    this.#dirty = true;
  }

  // 가로 기준선 목록: [{ value, color, label }]
  setLines(lines) {
    this.#lines = lines;
    this.#dirty = true;
  }

  #resize() {
    const r = this.#canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.#w = r.width;
    this.#h = r.height;
    this.#canvas.width = Math.round(r.width * dpr);
    this.#canvas.height = Math.round(r.height * dpr);
    this.#dirty = true;
  }

  #draw() {
    const ctx = this.#ctx;
    const dpr = window.devicePixelRatio || 1;
    const css = getComputedStyle(document.documentElement);
    const line = css.getPropertyValue('--line').trim() || '#ccc';
    const sub = css.getPropertyValue('--sub').trim() || '#666';
    const w = this.#w;
    const h = this.#h;
    const pad = 6;
    const yOf = (v) => h / 2 - (v / this.#range) * (h / 2 - pad);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 눈금선
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const v of [-2048, -1024, 0, 1024, 2048]) {
      const y = yOf(v);
      ctx.strokeStyle = line;
      ctx.lineWidth = v === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillStyle = sub;
      ctx.fillText(String(v), 4, y - 8 < 6 ? y + 8 : y - 8);
    }

    // 기준선 (점선): 규칙에서 쓰는 숫자가 어디쯤인지 보여 준다
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    for (const { value, color, label } of this.#lines) {
      if (Math.abs(value) > this.#range) continue;
      const y = yOf(value);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(label, w - 4, y - 2);
    }
    ctx.setLineDash([]);
    ctx.textAlign = 'left';

    // 선 그래프 (가장 새 값이 오른쪽 끝)
    const step = w / (this.#max - 1);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (const { key, color } of this.#series) {
      const arr = this.#data[key];
      if (arr.length < 2) continue;
      ctx.strokeStyle = color;
      ctx.beginPath();
      arr.forEach((v, i) => {
        const x = w - (arr.length - 1 - i) * step;
        const y = yOf(Math.max(-this.#range, Math.min(this.#range, v)));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
}
