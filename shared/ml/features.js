// 센서 기록을 "1초짜리 조각"으로 자르고, 조각마다 숫자 15개(특징)를 뽑는다.
// 샘플은 [x, y, z] 배열이고, 1초 = 50개(50Hz)로 본다.
export const WINDOW = 50; // 한 조각의 길이 (1초)
export const STRIDE = 12; // 조각을 밀어 가는 간격 (약 0.25초)

export function windows(samples, size = WINDOW, stride = STRIDE) {
  const out = [];
  for (let i = 0; i + size <= samples.length; i += stride) out.push(samples.slice(i, i + size));
  return out;
}

function stats(values) {
  const n = values.length;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  let sq = 0;
  for (const v of values) sq += (v - mean) ** 2;
  return { mean, std: Math.sqrt(sq / n), min, max };
}

// 축마다 평균·흔들림·최소·최대 (12개) + 전체 힘 크기의 평균·흔들림·최대 (3개) = 15개
export function features(win) {
  const f = [];
  for (let axis = 0; axis < 3; axis++) {
    const s = stats(win.map((p) => p[axis]));
    f.push(s.mean, s.std, s.min, s.max);
  }
  const mag = stats(win.map((p) => Math.hypot(p[0], p[1], p[2])));
  f.push(mag.mean, mag.std, mag.max);
  return f;
}
