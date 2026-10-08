// 가장 닮은 이웃 k개에게 물어보는 AI (k-NN). 서버 없이 브라우저 안에서만 돈다.
// examples: [{ label, rec, f }]  label=동작 이름, rec=어느 녹화에서 왔는지, f=특징 15개
export const UNKNOWN = null; // "모르겠어요"

export class KnnClassifier {
  #k;
  #items = [];
  #mean = [];
  #std = [];
  #limit = Infinity; // 이 거리보다 멀면 "모르겠어요"

  constructor(k = 3) {
    this.#k = k;
  }

  get size() {
    return this.#items.length;
  }

  train(examples) {
    const dim = examples[0]?.f.length ?? 0;
    const n = examples.length;
    this.#mean = Array(dim).fill(0);
    this.#std = Array(dim).fill(1);
    for (const e of examples) e.f.forEach((v, i) => (this.#mean[i] += v / n));
    const variance = Array(dim).fill(0);
    for (const e of examples) e.f.forEach((v, i) => (variance[i] += (v - this.#mean[i]) ** 2 / n));
    this.#std = variance.map((v) => Math.sqrt(v) || 1);
    this.#items = examples.map((e) => ({ label: e.label, rec: e.rec, z: this.#norm(e.f) }));
    this.#limit = this.#computeLimit();
    return this;
  }

  #norm(f) {
    return f.map((v, i) => (v - this.#mean[i]) / this.#std[i]);
  }

  // 같은 동작이지만 "다른 녹화"에 있는 가장 가까운 조각까지의 거리를 모아서,
  // 그 거리의 상위값 x 1.5를 "너무 멀다"의 기준으로 삼는다.
  #computeLimit() {
    const gaps = [];
    for (const a of this.#items) {
      let best = Infinity;
      for (const b of this.#items) {
        if (b.rec === a.rec || b.label !== a.label) continue;
        best = Math.min(best, dist(a.z, b.z));
      }
      if (best !== Infinity) gaps.push(best);
    }
    if (!gaps.length) return Infinity;
    gaps.sort((p, q) => p - q);
    return gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.95))] * 1.5;
  }

  // 돌려주는 값: { label (모르면 null), nearest(상관없이 1등 이름), confidence 0~1, distance }
  predict(f) {
    const z = this.#norm(f);
    const near = this.#items
      .map((it) => ({ label: it.label, d: dist(z, it.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.#k);
    const votes = new Map();
    for (const n of near) votes.set(n.label, (votes.get(n.label) ?? 0) + 1);
    let top = null;
    let topVotes = 0;
    for (const n of near) {
      const v = votes.get(n.label);
      if (v > topVotes) {
        top = n.label;
        topVotes = v;
      }
    }
    const distance = near[0]?.d ?? Infinity;
    return {
      label: distance > this.#limit ? UNKNOWN : top,
      nearest: top,
      confidence: topVotes / Math.max(1, near.length),
      distance,
    };
  }
}

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

// 녹화 하나씩 빼놓고 나머지로 공부시킨 뒤, 빼놓은 녹화를 맞혀 보게 한다.
// (겹치는 조각이 시험지에 섞이면 점수가 거짓으로 높아지기 때문이다.)
// 돌려주는 값: { accuracy 0~1, total, labels, matrix[실제][예측], unknownCol } 또는 null
export function evaluate(examples, k = 3) {
  const labels = [...new Set(examples.map((e) => e.label))];
  const recsPerLabel = new Map();
  for (const e of examples) {
    if (!recsPerLabel.has(e.label)) recsPerLabel.set(e.label, new Set());
    recsPerLabel.get(e.label).add(e.rec);
  }
  const usable = labels.filter((l) => recsPerLabel.get(l).size >= 2);
  if (usable.length < 2) return null;

  const pool = examples.filter((e) => usable.includes(e.label));
  const matrix = usable.map(() => Array(usable.length + 1).fill(0)); // 마지막 칸 = 모르겠어요
  let correct = 0;
  let total = 0;
  for (const rec of new Set(pool.map((e) => e.rec))) {
    const test = pool.filter((e) => e.rec === rec);
    const rest = pool.filter((e) => e.rec !== rec);
    if (new Set(rest.map((e) => e.label)).size < 2) continue;
    const clf = new KnnClassifier(k).train(rest);
    for (const t of test) {
      const p = clf.predict(t.f).label;
      const row = usable.indexOf(t.label);
      const col = p === UNKNOWN ? usable.length : usable.indexOf(p);
      matrix[row][col < 0 ? usable.length : col]++;
      total++;
      if (p === t.label) correct++;
    }
  }
  if (!total) return null;
  return { accuracy: correct / total, total, labels: usable, matrix };
}
