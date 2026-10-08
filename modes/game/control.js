import { RuleRunner } from '../../shared/rules/engine.js';

// 점프 게임(2D, 3D)이 같이 쓰는 "무엇으로 뛰게 할까?" 도우미.
//   🤖 AI 동작: 동작 맞히기 AI가 배운 동작으로 뛴다 (게임 파일이 직접 처리한다)
//   🧪 내 규칙: 내가 만드는 규칙에서 마지막으로 ▶ 실행한 규칙의 점프()로 뛴다
// 두 방법의 점수를 따로 기억해서 비교해 준다.
export const RULE_RAN_KEY = 'microlab.rules.ran'; // rules.js가 ▶ 실행할 때 저장한다
const MODE_KEY = 'microlab.game.control';
const SCORE_KEY = 'microlab.game.scores.';

function read(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장이 막힌 브라우저에서는 이번 화면에서만 기억한다
  }
}

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

// gameId: 'game' | 'game3d' (점수를 게임마다 따로 기억)
// onJump: 규칙이 점프()를 부르면 불리는 함수
// onModeChange(mode): 고르기가 바뀔 때
export function createControl({ gameId, onJump, onModeChange }) {
  let mode = read(MODE_KEY, 'ai') === 'rule' ? 'rule' : 'ai';
  let scores = { ai: { best: 0, plays: 0 }, rule: { best: 0, plays: 0 } };
  try {
    const saved = JSON.parse(read(SCORE_KEY + gameId, 'null'));
    if (saved?.ai && saved?.rule) scores = saved;
  } catch {
    // 깨진 기록은 버린다
  }

  const noteEl = h('div', { class: 'msg', hidden: true, role: 'status' });
  const compareEl = h('p', { class: 'small compare', 'aria-live': 'polite' });
  const aiBox = h('div', { class: 'ctl-box' });
  const ruleBox = h('div', { class: 'ctl-box' });
  const chips = h('div', { class: 'step-bar', role: 'radiogroup', 'aria-label': '무엇으로 뛰게 할까요?' });

  const runner = new RuleRunner({
    onAction(name) {
      if (name === 'jump') onJump();
    },
    onReady() {},
    onError({ message }) {
      note('내 규칙에 문제가 있어요: ' + message, 'bad');
    },
  });

  function note(text, kind = '') {
    noteEl.hidden = !text;
    noteEl.textContent = text || '';
    noteEl.className = 'msg ' + kind;
  }

  function code() {
    return read(RULE_RAN_KEY, '');
  }

  // 내 규칙으로 켜져 있으면 규칙을 (다시) 불러와서 돌린다
  function loadRule() {
    runner.stop();
    if (mode !== 'rule') return;
    const text = code();
    if (!text.trim()) {
      note('아직 실행해 본 규칙이 없어요. "내가 만드는 규칙"에서 규칙을 만들고 ▶ 실행을 한 번 눌러 보세요.', 'warn');
      return;
    }
    if (!/점프\s*\(/.test(text)) {
      note('내 규칙에 점프() 블록이 없어요. 규칙에서 "점프" 블록을 넣고 다시 ▶ 실행해 보세요.', 'warn');
    } else {
      note('');
    }
    runner.start(text);
  }

  function paint() {
    chips.replaceChildren(
      ...[['ai', '🤖 AI 동작으로'], ['rule', '🧪 내 규칙으로']].map(([id, label]) =>
        h('button', {
          class: 'step-chip' + (mode === id ? ' on' : ''),
          role: 'radio',
          'aria-checked': String(mode === id),
          onclick: () => setMode(id),
        }, label)));
    aiBox.hidden = mode !== 'ai';
    ruleBox.hidden = mode !== 'rule';
    renderCompare();
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    write(MODE_KEY, mode);
    if (mode === 'ai') note('');
    loadRule();
    paint();
    onModeChange?.(mode);
  }

  function renderCompare() {
    const a = scores.ai;
    const r = scores.rule;
    let text;
    if (!a.plays || !r.plays) {
      text = `🤖 AI 최고 ${a.best} · 🧪 내 규칙 최고 ${r.best} — 두 방법으로 한 번씩 해 보면 비교해 줘요.`;
    } else {
      const verdict = r.best > a.best ? '내 규칙이 이겼어요! 🎉' : r.best < a.best ? 'AI가 앞서요. 규칙을 고쳐 볼까요?' : '비겼어요!';
      text = `🤖 AI 최고 ${a.best} (${a.plays}판) · 🧪 내 규칙 최고 ${r.best} (${r.plays}판) → ${verdict}`;
    }
    compareEl.textContent = text;
  }

  ruleBox.append(
    h('div', { class: 'actions' },
      h('button', { class: 'ghost', onclick: loadRule }, '🔄 내 규칙 다시 불러오기'),
      h('a', { href: '#/rules', class: 'small' }, '규칙 고치러 가기 →')),
    h('p', { class: 'small' }, '"내가 만드는 규칙"에서 마지막으로 ▶ 실행한 규칙을 써요. 규칙 안의 점프()가 불리면 캐릭터가 뛰어요.'));

  paint();

  return {
    get mode() {
      return mode;
    },
    // 화면에 넣을 조각들: 고르는 칩, 안내 상자, 비교 문장. aiRow는 게임 파일이 만든 AI 동작 고르는 줄.
    chooser: (aiRow) => {
      aiBox.replaceChildren(aiRow);
      return h('div', {}, chips, aiBox, ruleBox, noteEl);
    },
    compareEl,
    start: loadRule,
    push: (s) => {
      if (mode === 'rule') runner.push(s);
    },
    stop: () => runner.stop(),
    // 판이 끝날 때 불러서 점수를 기록한다
    record(score) {
      const s = scores[mode];
      s.plays += 1;
      s.best = Math.max(s.best, score);
      write(SCORE_KEY + gameId, JSON.stringify(scores));
      renderCompare();
    },
  };
}
