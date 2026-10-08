import { windows, features } from '../../shared/ml/features.js';
import { KnnClassifier, evaluate, UNKNOWN } from '../../shared/ml/knn.js';

// 동작 맞히기 AI: 동작을 기록해서 가르치고 -> 점수를 보고 -> 맞혀 보고 -> LED로 알려 준다.

const PREP_MS = 1000; // 녹화 전 준비 시간
const REC_MS = 3000; // 녹화 시간
const MIN_HZ = 10; // 초당 센서값이 이보다 적으면 녹화 실패로 본다
const DEFAULT_HZ = 25; // 아직 녹화가 없을 때 쓰는 기본 속도

// 판단할 때 보는 조각의 길이(초). 짧을수록 반응이 빠르지만 덜 정확할 수 있다.
const WIN_SEC = 0.7;

// 마이크로비트가 보내는 속도(USB 약 18, 블루투스 약 11)에 맞춰 조각의 크기를 정한다.
// stride: 학습용 조각을 만드는 간격. 맞혀 볼 때는 센서값이 하나 들어올 때마다 판단해서 반응을 빠르게 한다.
function pace(recs) {
  const hzs = recs.map((r) => r.hz).filter(Number.isFinite).sort((a, b) => a - b);
  const hz = hzs.length ? hzs[Math.floor(hzs.length / 2)] : DEFAULT_HZ;
  const win = Math.min(50, Math.max(6, Math.round(hz * WIN_SEC)));
  return { win, stride: Math.max(2, Math.round(win / 4)) };
}
const GOAL = 0.85;

const ICONS = [
  ['none', '(아무것도 안 함)'],
  ['heart', '💗 하트'],
  ['happy', '😀 웃는 얼굴'],
  ['sad', '😢 우는 얼굴'],
  ['yes', '✔️ 맞아요'],
  ['no', '✖️ 아니에요'],
  ['clear', '⬛ 끄기'],
];

// 모드를 떠났다가 돌아와도 데이터가 남도록 모듈 안에 보관한다.
const store = {
  labels: [
    { name: '흔들기', icon: 'happy' },
    { name: '위로 들기', icon: 'heart' },
    { name: '가만히', icon: 'clear' },
  ],
  recs: [], // { id, label, samples: [[x,y,z], ...] }
  nextId: 1,
  sendLed: true,
  step: 1,
};

// 새로고침해도, 점프 게임에서도 가르친 동작이 남도록 브라우저(localStorage)에도 저장한다.
const SAVE_KEY = 'microlab.gesture.v1';

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ labels: store.labels, recs: store.recs, nextId: store.nextId, sendLed: store.sendLed }));
  } catch {
    // 저장이 막혔거나 가득 찬 브라우저에서는 이번 화면에서만 기억한다
  }
}

(function restore() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!d || !Array.isArray(d.labels) || !Array.isArray(d.recs)) return;
    const labels = d.labels
      .filter((l) => l && typeof l.name === 'string' && l.name)
      .map((l) => ({ name: l.name.slice(0, 12), icon: ICONS.some(([v]) => v === l.icon) ? l.icon : 'none' }));
    if (!labels.length) return;
    const names = new Set(labels.map((l) => l.name));
    const recs = d.recs.filter((r) => names.has(r.label) && Array.isArray(r.samples) && Number.isFinite(r.hz) &&
      r.samples.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)));
    store.labels = labels;
    store.recs = recs;
    store.nextId = recs.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
    if (typeof d.sendLed === 'boolean') store.sendLed = d.sendLed;
  } catch {
    // 저장된 내용이 깨졌으면 처음부터 시작한다
  }
})();

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter((c) => c != null && c !== false));
  return el;
}

// 다른 모드(게임 등)가 제스처 모드에서 가르친 동작을 쓸 수 있게 꺼내 준다.
// 동작이 2가지 미만이면 null을 돌려준다.
// push(x, y, z)로 센서값을 넣으면, 동작이 바뀔 때마다 onLabel(이름)이 불린다.
export function getRecognizer(onLabel) {
  const { win, stride } = pace(store.recs);
  const ex = [];
  for (const r of store.recs) {
    for (const w of windows(r.samples, win, stride)) ex.push({ label: r.label, f: features(w) });
  }
  const names = [...new Set(ex.map((e) => e.label))];
  if (names.length < 2) return null;
  const clf = new KnnClassifier(3).train(ex);
  let buffer = [];
  let recent = [];
  let stable;
  return {
    labels: names,
    push(x, y, z) {
      buffer.push([x, y, z]);
      while (buffer.length > win) buffer.shift();
      if (buffer.length < win) return;
      recent.push(clf.predict(features(buffer)).label);
      if (recent.length > 3) recent.shift();
      const counts = new Map();
      for (const l of recent) counts.set(l, (counts.get(l) ?? 0) + 1);
      let best = stable;
      for (const [l, n] of counts) if (n >= 2) best = l;
      if (stable === undefined) best = recent[recent.length - 1];
      if (best !== stable) {
        stable = best;
        onLabel(stable);
      }
    },
    reset() {
      buffer = [];
      recent = [];
      stable = undefined;
    },
  };
}

export function mount(root, { conn }) {
  let clf = null; // 공부를 마친 AI
  let evalResult = null;
  let rec = null; // 녹화 중이면 { label, phase, samples, startedAt }
  let recTimer = null;
  let buffer = []; // 맞혀 보기용 최근 센서값
  let recent = []; // 최근 예측 3개 (깜빡임 막기)
  let stable;
  let lastSentIcon = null;

  const teachEl = h('div');
  const evalEl = h('div');
  const liveEl = h('div');
  const actionEl = h('div');
  const statusEl = h('div', { class: 'msg', hidden: true, role: 'status' });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: onLoadFile });

  const STEPS = [
    ['동작 기록하기', '🎬'],
    ['AI 가르치기', '🧠'],
    ['맞혀 보기', '🎯'],
  ];
  const stepBar = h('div', { class: 'step-bar', role: 'tablist' });
  const sec = (n, title, ...kids) =>
    h('section', { class: 'card gest-step', 'data-gstep': n },
      h('h2', { class: 'step-title' }, h('b', {}, String(n)), title), ...kids);
  const nav = (back, next, nextLabel) =>
    h('div', { class: 'step-nav' },
      back ? h('button', { class: 'ghost', onclick: () => goStep(back) }, '← 이전') : null,
      next ? h('button', { onclick: () => goStep(next) }, nextLabel) : null);
  const nextBtn1 = h('button', { onclick: () => goStep(2) }, 'AI 가르치러 가기 →');
  const readyEl = h('p', { class: 'ready-note', 'aria-live': 'polite' });
  const secs = [
    sec(1, '동작 기록하기', teachEl, readyEl, h('div', { class: 'step-nav' }, nextBtn1)),
    sec(2, 'AI 가르치기', evalEl, nav(1, 3, '맞혀 보러 가기 →')),
    sec(3, '맞혀 보기', liveEl, h('h3', { class: 'sub-h' }, '맞히면 어떻게 할까요?'), actionEl, nav(2, 0)),
  ];

  function goStep(n) {
    store.step = n;
    secs.forEach((el, i) => (el.hidden = i + 1 !== n));
    stepBar.replaceChildren(...STEPS.map(([t, em], i) =>
      h('button', { class: 'step-chip' + (i + 1 === n ? ' on' : ''), role: 'tab', 'aria-selected': String(i + 1 === n), onclick: () => goStep(i + 1) },
        h('span', {}, String(i + 1)), `${em} ${t}`)));
    window.scrollTo({ top: 0 });
  }

  root.replaceChildren(
    h('section', { class: 'card' },
      h('h2', {}, '🖐️ 동작 맞히기 AI'),
      h('p', { class: 'small' }, '① 내 동작을 기록하고 → ② AI가 공부하고 → ③ 새 동작을 맞혀 봐요.'),
      stepBar,
      h('div', { class: 'actions' },
        h('button', { class: 'ghost', onclick: saveFile }, '💾 저장하기'),
        h('button', { class: 'ghost', onclick: () => fileInput.click() }, '📂 불러오기'),
        fileInput),
      statusEl),
    ...secs,
  );
  goStep(store.step);

  // ---------- 알림 ----------
  function say(text, kind = '') {
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
    statusEl.className = 'msg ' + kind;
  }

  // ---------- 공부와 시험 ----------
  function examples() {
    const out = [];
    for (const r of store.recs) {
      for (const w of windows(r.samples, pace(store.recs).win, pace(store.recs).stride)) out.push({ label: r.label, rec: r.id, f: features(w) });
    }
    return out;
  }

  function retrain() {
    const ex = examples();
    clf = new Set(ex.map((e) => e.label)).size >= 2 ? new KnnClassifier(3).train(ex) : null;
    evalResult = evaluate(ex, 3);
    recent = [];
    stable = undefined;
    lastSentIcon = null;
    persist();
    renderAll();
  }

  // ---------- 화면 그리기 ----------
  function recsOf(name) {
    return store.recs.filter((r) => r.label === name);
  }

  // 점수를 내려면: 기록한 동작이 2가지 이상이고, 기록한 동작마다 2번 이상 기록해야 한다.
  function readiness() {
    const used = store.labels.map((l) => ({ name: l.name, n: recsOf(l.name).length })).filter((l) => l.n > 0);
    const need = used.filter((l) => l.n < 2);
    return { ok: used.length >= 2 && !need.length, used, need };
  }

  function paintReady() {
    const { ok, used, need } = readiness();
    nextBtn1.disabled = !ok;
    readyEl.className = 'ready-note ' + (ok ? 'ok' : 'wait');
    if (ok) readyEl.textContent = '✅ 준비 끝! 이제 AI에게 가르쳐 볼까요?';
    else if (need.length) readyEl.textContent = `✋ ${need.map((l) => `"${l.name}"`).join(', ')}을(를) 한 번 더 기록해 주세요. (동작마다 2번씩)`;
    else if (used.length === 1) readyEl.textContent = '✋ 다른 동작도 2번씩 기록해 주세요. (동작이 2가지 이상 필요해요)';
    else readyEl.textContent = '✋ 동작을 2번씩 기록하면 다음으로 갈 수 있어요.';
  }

  function renderTeach() {
    const busy = !!rec;
    const rows = store.labels.map((lb) => {
      const mine = recsOf(lb.name);
      const wins = mine.reduce((n, r) => n + windows(r.samples, pace(store.recs).win, pace(store.recs).stride).length, 0);
      const isRec = rec?.label === lb.name;
      return h('div', { class: 'gest-row' },
        h('div', { class: 'gest-name' },
          h('b', {}, lb.name),
          h('small', { class: 'small' }, mine.length >= 2 ? `✅ 기록 ${mine.length}번` : mine.length === 1 ? '🟡 기록 1/2 · 한 번 더!' : '⚪ 기록 0/2')),
        h('div', { class: 'actions', style: 'margin:0' },
          h('button', { disabled: busy || !conn.connected, onclick: () => startRec(lb.name) },
            isRec ? '기록 중...' : '● 기록하기 (3초)'),
          h('button', { class: 'ghost', disabled: busy || !mine.length, onclick: () => clearLabel(lb.name) }, '기록 지우기'),
          h('button', { class: 'ghost', disabled: busy, 'aria-label': `${lb.name} 동작 없애기`, onclick: () => removeLabel(lb.name) }, '✕')));
    });
    const input = h('input', { type: 'text', maxlength: 12, placeholder: '새 동작 이름 (예: 오른쪽으로)', 'aria-label': '새 동작 이름' });
    const add = () => {
      const name = input.value.trim();
      if (!name) return;
      if (store.labels.some((l) => l.name === name)) return say('이미 있는 이름이에요.', 'warn');
      store.labels.push({ name, icon: 'none' });
      persist();
      renderAll();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && add());
    teachEl.replaceChildren(
      h('p', { class: 'small' },
        conn.connected
          ? '동작 이름 옆의 [기록하기]를 누르고, 1초 준비한 뒤 3초 동안 그 동작을 계속 해 보세요. 한 동작을 3번씩 기록하면 좋아요.'
          : '먼저 위에서 [센서 켜기]를 눌러 마이크로비트나 [마우스로 해 보기]를 켜 주세요.'),
      ...rows,
      h('div', { class: 'gest-add' }, input, h('button', { class: 'ghost', onclick: add }, '+ 동작 추가')));
    paintReady();
  }

  function renderEval() {
    if (!evalResult) {
      evalEl.replaceChildren(
        h('p', { class: 'small' }, '아직 점수를 낼 수 없어요. 1단계에서 동작마다 2번씩 기록해 주세요.'),
        h('button', { class: 'ghost', onclick: () => goStep(1) }, '← 동작 기록하러 가기'));
      return;
    }
    const pct = Math.round(evalResult.accuracy * 100);
    const ok = evalResult.accuracy >= GOAL;
    const { labels, matrix } = evalResult;
    // 가로줄 = 내가 한 동작, 세로줄 = AI의 대답. 줄마다 맞힌 것과 헷갈린 것을 문장으로 풀어 준다.
    const lines = [];
    const mixes = [];
    labels.forEach((l, r) => {
      const total = matrix[r].reduce((a, b) => a + b, 0);
      lines.push(h('li', {}, `"${l}" ${total}번 중 ${matrix[r][r]}번 맞혔어요 ${matrix[r][r] / total >= GOAL ? '✅' : '🟡'}`));
      matrix[r].forEach((n, c) => {
        if (c === r || !n) return;
        const other = c < labels.length ? `"${labels[c]}"` : '"모르겠어요"';
        mixes.push({ n, from: l, text: `"${l}" 동작을 AI가 ${other}(으)로 ${n}번 착각했어요` });
      });
    });
    mixes.sort((a, b) => b.n - a.n);
    const head = h('tr', {}, h('th', {}, '내가 한 동작 ↓ / AI 대답 →'),
      ...labels.map((l) => h('th', {}, l)), h('th', {}, '모르겠어요'));
    const body = labels.map((l, r) =>
      h('tr', {}, h('th', {}, l),
        ...matrix[r].map((n, c) => h('td', { class: c === r ? 'hit' : n ? 'miss' : '' }, String(n)))));
    evalEl.replaceChildren(
      h('p', { class: 'small' }, '기록을 보고 AI가 저절로 공부했어요. 공부한 것을 시험 봤더니…'),
      h('div', { class: 'score ' + (ok ? 'good' : 'low') }, `${pct}점`),
      h('p', { class: 'small' }, ok ? `조각 ${evalResult.total}개 중 ${pct}%를 맞혔어요. 아주 좋아요! 🎉` : `조각 ${evalResult.total}개 중 ${pct}%를 맞혔어요. 85점을 넘기면 아주 좋아요.`),
      h('ul', { class: 'eval-lines' }, ...lines),
      mixes.length
        ? h('div', { class: 'mix-box' },
          h('b', {}, '⚠️ 헷갈린 동작'),
          h('ul', {}, ...mixes.map((m) => h('li', {},
            m.text, ' ', h('button', { class: 'ghost mini', onclick: () => goStep(1) }, `"${m.from}" 더 기록하기`)))),
          h('p', { class: 'small' }, '💡 헷갈린 동작을 더 크게, 더 여러 번 기록하거나 두 동작을 더 다르게 해 보세요.'))
        : h('p', { class: 'mix-box good' }, '서로 헷갈린 동작이 없어요 🎉'),
      h('details', { class: 'matrix-fold' },
        h('summary', {}, '📊 표로 자세히 보기'),
        h('p', { class: 'small' }, '가로줄은 "내가 한 동작", 세로줄은 "AI의 대답"이에요. 초록 칸은 맞힌 개수, 빨간 칸은 헷갈린 개수예요.'),
        h('div', { class: 'tablewrap' }, h('table', { class: 'matrix' }, h('thead', {}, head), h('tbody', {}, ...body)))));
  }

  function renderLive() {
    if (!clf) {
      liveEl.replaceChildren(h('p', { class: 'small' }, '동작을 2가지 이상 기록하면 여기서 맞혀 볼 수 있어요.'));
      return;
    }
    liveEl.replaceChildren(
      h('p', { class: 'small' }, conn.connected ? '마이크로비트를 움직여 보세요. AI가 지금 무슨 동작인지 말해 줘요.' : '연결하면 맞혀 볼 수 있어요.'),
      h('div', { class: 'live-label', 'data-live-label': true, 'aria-live': 'polite' }, '...'),
      h('div', { class: 'bar' }, h('i', { 'data-live-bar': true })),
      h('div', { class: 'small', 'data-live-note': true }, ''),
      h('div', { class: 'small', 'data-live-sent': true }, ''));
  }

  function renderAction() {
    const rows = store.labels.map((lb) =>
      h('label', { class: 'act-row' },
        h('span', {}, `"${lb.name}" 이면`),
        (() => {
          const sel = h('select', { onchange: () => { lb.icon = sel.value; persist(); } },
            ...ICONS.map(([v, t]) => h('option', { value: v, selected: lb.icon === v }, t)));
          return sel;
        })()));
    actionEl.replaceChildren(
      h('label', { class: 'act-row' },
        h('input', { type: 'checkbox', checked: store.sendLed, onchange: (e) => { store.sendLed = e.target.checked; persist(); } }),
        h('span', {}, '마이크로비트 LED에 그림 보여 주기')),
      ...rows,
      h('p', { class: 'small' }, '"모르겠어요"일 때는 아무것도 하지 않아요.'));
  }

  function renderAll() {
    renderTeach();
    renderEval();
    renderLive();
    renderAction();
  }

  // ---------- 녹화 ----------
  function startRec(name) {
    if (rec || !conn.connected) return;
    rec = { label: name, phase: 'prep', samples: [], startedAt: performance.now() };
    renderTeach();
    recTimer = setInterval(tickRec, 100);
    tickRec();
  }

  function tickRec() {
    if (!rec) return;
    const el = performance.now() - rec.startedAt;
    if (rec.phase === 'prep') {
      if (el >= PREP_MS) {
        rec.phase = 'go';
        rec.startedAt = performance.now();
        rec.samples = [];
      } else {
        say(`"${rec.label}" 준비하세요... ${Math.ceil((PREP_MS - el) / 1000)}`, 'warn');
        return;
      }
    }
    const left = REC_MS - (performance.now() - rec.startedAt);
    if (left > 0) {
      say(`🔴 "${rec.label}" 기록 중... ${(left / 1000).toFixed(1)}초`, 'bad');
      return;
    }
    finishRec();
  }

  function finishRec() {
    clearInterval(recTimer);
    recTimer = null;
    const done = rec;
    rec = null;
    const hz = done.samples.length / (REC_MS / 1000);
    if (hz < MIN_HZ) {
      say(`움직임 숫자가 너무 적게 들어왔어요 (초당 ${Math.round(hz)}개). 연결을 확인하고 다시 기록해 주세요.`, 'bad');
      renderTeach();
      return;
    }
    store.recs.push({ id: store.nextId++, label: done.label, samples: done.samples, hz });
    say(`"${done.label}" 기록 끝! (움직임 숫자 ${done.samples.length}개, 초당 ${Math.round(hz)}개)`);
    retrain();
  }

  function cancelRec() {
    clearInterval(recTimer);
    recTimer = null;
    rec = null;
  }

  function clearLabel(name) {
    store.recs = store.recs.filter((r) => r.label !== name);
    say('');
    retrain();
  }

  function removeLabel(name) {
    store.labels = store.labels.filter((l) => l.name !== name);
    store.recs = store.recs.filter((r) => r.label !== name);
    say('');
    retrain();
  }

  // ---------- 저장 / 불러오기 ----------
  function saveFile() {
    const data = { app: 'microlab-gesture', version: 1, labels: store.labels, recs: store.recs };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = h('a', { href: url, download: 'microlab-gesture.json' });
    a.click();
    URL.revokeObjectURL(url);
    say('저장했어요. 내려받기 폴더를 확인해 보세요.');
  }

  async function onLoadFile() {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== 'microlab-gesture' || !Array.isArray(d.labels) || !Array.isArray(d.recs)) throw new Error('모양이 달라요');
      const labels = d.labels.slice(0, 12).map((l) => ({
        name: String(l.name).slice(0, 12),
        icon: ICONS.some(([v]) => v === l.icon) ? l.icon : 'none',
      }));
      const names = new Set(labels.map((l) => l.name));
      const recs = d.recs
        .filter((r) => names.has(r.label) && Array.isArray(r.samples) &&
          r.samples.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)))
        .slice(0, 200)
        .map((r, i) => ({ id: i + 1, label: r.label, samples: r.samples.slice(0, 1000), hz: Number.isFinite(r.hz) ? r.hz : Math.min(r.samples.length, 1000) / (REC_MS / 1000) }));
      store.labels = labels;
      store.recs = recs;
      store.nextId = recs.length + 1;
      say(`불러왔어요. (동작 ${labels.length}개, 기록 ${recs.length}번)`);
      retrain();
    } catch (err) {
      say('이 파일은 불러올 수 없어요. 마이크로랩에서 저장한 .json 파일인지 확인해 주세요.', 'bad');
    }
  }

  // ---------- 센서값 받기, 맞혀 보기 ----------
  function onSample(s) {
    const p = [s.x, s.y, s.z];
    if (rec?.phase === 'go') rec.samples.push(p);
    buffer.push(p);
    const { win } = pace(store.recs);
    while (buffer.length > win) buffer.shift();
    if (clf && buffer.length === win && !rec) predictNow();
  }

  function predictNow() {
    const p = clf.predict(features(buffer));
    recent.push(p.label);
    if (recent.length > 3) recent.shift();
    // 최근 3번 중 2번 이상 같은 대답이면 그걸로 정한다 (깜빡임 방지)
    const counts = new Map();
    for (const l of recent) counts.set(l, (counts.get(l) ?? 0) + 1);
    let best = stable;
    for (const [l, n] of counts) if (n >= 2) best = l;
    if (best !== stable || stable === undefined) {
      stable = best === undefined ? p.label : best;
      onChange(stable);
    }
    showLive(stable, p);
  }

  function showLive(label, p) {
    const lab = liveEl.querySelector('[data-live-label]');
    if (!lab) return;
    lab.textContent = label === UNKNOWN ? '모르겠어요 🤔' : label;
    lab.classList.toggle('unknown', label === UNKNOWN);
    const bar = liveEl.querySelector('[data-live-bar]');
    const pct = label === UNKNOWN ? 0 : Math.round(p.confidence * 100);
    bar.style.width = pct + '%';
    liveEl.querySelector('[data-live-note]').textContent =
      label === UNKNOWN ? '배운 동작이랑 많이 달라요.' : `확신 ${pct}%`;
  }

  function onChange(label) {
    if (!store.sendLed || label === UNKNOWN) return;
    const icon = store.labels.find((l) => l.name === label)?.icon;
    if (!icon || icon === 'none' || icon === lastSentIcon) return;
    lastSentIcon = icon;
    conn.send('icon:' + icon);
    const sent = liveEl.querySelector('[data-live-sent]');
    if (sent) sent.textContent = `마이크로비트에게 "${ICONS.find(([v]) => v === icon)[1]}" 그림을 보여 달라고 했어요.`;
  }

  const offs = [
    conn.on('sample', onSample),
    conn.on('status', ({ state }) => {
      if (state === 'disconnected' || state === 'error') {
        cancelRec();
        buffer = [];
        recent = [];
        stable = undefined;
        lastSentIcon = null;
      }
      renderTeach();
      renderLive();
    }),
  ];

  retrain();

  return () => {
    offs.forEach((off) => off());
    cancelRec();
  };
}
