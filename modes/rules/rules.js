import { LiveChart } from '../../shared/ui/chart.js';
import { RuleRunner } from '../../shared/rules/engine.js';
import { attachEditorAssist, bracketHint, formatCode } from './editor-assist.js';
import { mountBlocks } from './blocks.js';
import { mountHelp } from './help.js';
import { mountMissions } from './missions.js';
import { mountNotes } from './notes.js';

// 내가 만드는 규칙 모드 (1단계: 글 코드)
// 센서값을 보고 "이럴 때 → 이렇게 반응해라"를 학생이 직접 짜서 실행해 본다.

const CODE_KEY = 'microlab.rules.code';
const GUIDE_KEY = 'microlab.rules.guideSeen';
const LEVEL_KEY = 'microlab.rules.level';

// 코딩 방식: 블록만 / 블록 + 글 코드 보기 / 글 코드
const LEVELS = {
  block: ['🌱 블록', '블록을 끼워 맞춰요'],
  bridge: ['🌿 블록 + 코드 보기', '블록이 어떤 글이 되는지 봐요'],
  text: ['🌳 글 코드', '직접 글로 써요'],
};

// 처음 따라 해 보는 연습 예제 (미션의 정답이 아니라 "이렇게 쓰는구나"를 보는 용도)
const EXAMPLE = `// 흔들면 하트가 나오고, 가만히 있으면 꺼져요.
function 반복() {
  if (흔들림 > 300) {
    하트()
  } else {
    끄기()
  }
}
`;

const STARTER = `// 센서값이 올 때마다 아래 반복()이 실행돼요.
// x, y, z 는 기울기, 세기는 전체 힘(가만히 있으면 약 1024), 흔들림은 얼마나 흔들었는지(가만히 있으면 0)예요.
// 어떤 규칙을 만들까 먼저 그래프를 보면서 생각해 봐요!
function 반복() {

}
`;

// 그래프에 그릴 선: x, y, z 와 세기(m)
const SERIES = [
  { key: 'x', color: '#ef4444' },
  { key: 'y', color: '#16a34a' },
  { key: 'z', color: '#3b82f6' },
  { key: 'm', color: '#374151' },
];
const COLOR = Object.fromEntries(SERIES.map((s) => [s.key, s.color]));

// 가짜 LED 그림 (5x5)
const ICON_ROWS = {
  heart: ['01010', '11111', '11111', '01110', '00100'],
  happy: ['00000', '01010', '00000', '10001', '01110'],
  sad: ['00000', '01010', '00000', '01110', '10001'],
  yes: ['00000', '00001', '00010', '10100', '01000'],
  no: ['10001', '01010', '00100', '01010', '10001'],
  clear: ['00000', '00000', '00000', '00000', '00000'],
};

// 코드를 쓰다가 눌러서 넣는 조각 [버튼 글자, 넣을 글, 커서를 둘 위치(끝에서 몇 글자 앞), 설명]
const SNIPPET_GROUPS = [
  ['조건', [
    ['만약 …', 'if (x > 500) {\n  \n}', 4, '만약 이럴 때 → 이렇게 해요'],
    ['아니면', ' else {\n  \n}', 2, '만약이 아닐 때는 이렇게 해요'],
    ['변수 만들기', 'let 횟수 = 0', 0, '숫자를 기억해 두는 상자를 만들어요'],
  ]],
  ['LED', [
    ['하트()', '하트()', 0, '마이크로비트에 하트를 보여 줘요'],
    ['웃음()', '웃음()', 0, '웃는 얼굴'],
    ['울음()', '울음()', 0, '우는 얼굴'],
    ['예()', '예()', 0, '체크 표시'],
    ['아니오()', '아니오()', 0, 'X 표시'],
    ['끄기()', '끄기()', 0, 'LED를 꺼요'],
  ]],
  ['기타', [
    ['말하기("")', '말하기("")', 2, '아래 말풍선에 글을 보여 줘요'],
  ]],
];

// 코드에서 "x > 500" 같은 비교를 찾아서 그래프의 기준선으로 보여 준다.
const COMPARE = /(?<![\w가-힣])(x|y|z|세기|흔들림)\s*(?:>=|<=|>|<|===|==|!==|!=)\s*(-?\d+(?:\.\d+)?)/g;
function findLines(code) {
  const text = code.replace(/\/\/.*$/gm, '');
  const seen = new Set();
  const lines = [];
  const add = (key, value, label) => {
    const id = key + ':' + value;
    if (seen.has(id) || lines.length >= 8) return;
    seen.add(id);
    lines.push({ value, color: COLOR[key], label });
  };
  for (const m of text.matchAll(COMPARE)) {
    const name = m[1];
    const n = Number(m[2]);
    if (name === '흔들림') {
      // 흔들림 = 세기가 1024에서 얼마나 멀어졌나. 그래서 세기 선에서 위아래 두 군데에 그린다.
      add('m', 1024 + n, `흔들림 ${n}`);
      add('m', 1024 - n, `흔들림 ${n}`);
    } else {
      add(name === '세기' ? 'm' : name, n, `${name} ${n}`);
    }
  }
  return lines;
}

export function mount(root, { conn }) {
  root.innerHTML = `
    <div class="rules-page" data-step="1" data-level="text">
      <div class="rules-top">
        <h2>🧪 내가 만드는 규칙</h2>
        <button class="ghost" data-help aria-expanded="false">❓ 도움말</button>
      </div>

      <section class="card guide" data-guide hidden aria-label="시작 가이드">
        <h3>이렇게 해 봐요</h3>
        <p style="margin:0">마이크로비트의 센서값을 보고 <b>"이럴 때 → 이렇게 반응해라"</b>를 직접 만들어 보는 곳이에요. 안 되면 왜 그런지 그래프를 보며 고쳐 봐요.</p>
        <ol class="guide-steps">
          <li><b>1</b><strong>센서 켜기</strong><span>마이크로비트를 연결하거나 <u>마우스로 해 보기</u>를 켜요. 그래프가 움직이면 성공!</span></li>
          <li><b>2</b><strong>규칙 쓰기</strong><span><u>② 규칙 만들기</u> 탭에서 규칙을 써요. 버튼을 누르면 글이 대신 들어가요.</span></li>
          <li><b>3</b><strong>실행하고 움직여 보기</strong><span><u>▶ 실행</u>을 누른 뒤 흔들거나 기울여 봐요. LED가 어떻게 되나요?</span></li>
        </ol>
        <div class="guide-try">
          <b>🔰 처음이라면 이 예제를 따라 해 봐요</b>
          <pre></pre>
          <div class="small">"흔들림이 300보다 크면 하트, 아니면 끄기"라는 뜻이에요. 300을 바꾸면 어떻게 될까요?</div>
          <div class="actions" style="margin:8px 0 0"><button data-example>예제 코드 넣기</button></div>
        </div>
        <div class="actions" style="margin:12px 0 0"><button class="ghost" data-guide-close>확인했어요, 시작할래요</button></div>
      </section>

      <nav class="tabbar" role="tablist" aria-label="단계">
        <button role="tab" data-tab="1"><b>1</b> 생각하기</button>
        <button role="tab" data-tab="2"><b>2</b> 규칙 만들기</button>
        <button role="tab" data-tab="3"><b>3</b> 돌아보기</button>
        <span class="run-pill tab-pill" data-pill role="status">⚪ 멈춰 있어요</span>
      </nav>

      <section class="card card-mission">
        <h3 class="step-title">🎯 미션 고르기 <small>(내가 정해도 좋아요)</small></h3>
        <div data-missions></div>
      </section>

      <div class="rules-grid">
        <div class="rules-col">
          <section class="card">
            <h3 class="step-title">📈 센서값 살펴보기 <small>그래프를 보며 생각해 봐요</small></h3>
            <div class="chart-wrap">
              <canvas aria-label="센서 값과 규칙의 기준선이 보이는 그래프"></canvas>
              <div class="chart-empty" data-connmsg hidden>
                <p>아직 센서값이 없어요.<br>먼저 센서를 켜 볼까요?</p>
                <div class="actions">
                  <button data-start-sim>🖱️ 마우스로 해 보기</button>
                  <button class="ghost" data-start-usb>🔌 마이크로비트 연결</button>
                </div>
              </div>
            </div>
            <div class="legend" aria-label="그래프 범례">
              <span style="--c:#ef4444">x <b data-val="x">–</b></span>
              <span style="--c:#16a34a">y <b data-val="y">–</b></span>
              <span style="--c:#3b82f6">z <b data-val="z">–</b></span>
              <span style="--c:#374151">세기 <b data-val="m">–</b></span>
              <span style="--c:#9ca3af">흔들림 <b data-val="s">–</b></span>
            </div>
            <div class="actions" data-simbar hidden style="margin-top:8px">
              <button class="ghost" data-stop-sim>⏹ 연습 멈추기</button>
              <span class="small">마우스로 해 보는 중이에요</span>
            </div>
            <p class="small" style="margin:8px 0 0">점선은 내 규칙에 쓴 숫자예요. 그래프의 선이 점선을 넘을 때 규칙이 반응해요.</p>
          </section>

          <section class="card card-result">
            <h3 class="step-title">💡 결과 보기</h3>
            <div class="rules-out">
              <div>
                <div class="led-grid" data-led role="img" aria-label="가짜 LED 화면"></div>
                <div class="small" style="margin-top:6px">가짜 LED<br>(진짜 마이크로비트도 같이 반응해요)</div>
              </div>
              <ul class="rules-log" data-log aria-label="말하기 기록" aria-live="polite"></ul>
            </div>
          </section>
        </div>

        <div class="rules-col rules-col-code">
          <section class="card card-code" data-card-code aria-label="규칙 쓰기">
            <div class="code-head">
              <h3 class="step-title">✍️ 규칙 쓰기 <small>이럴 때 → 이렇게</small></h3>
              <button class="ghost full-close" data-full-close hidden>✕ 작게 보기</button>
            </div>
            <div class="predict-bar" data-predict-bar>
              <label>🔮 내 예상 <input type="text" class="predict-input" data-predict maxlength="80" placeholder="아직 안 적었어요. 적으면 결과와 비교할 수 있어요"></label>
            </div>
            <div class="level-switch" role="radiogroup" aria-label="코딩 방식" data-levels></div>
            <div data-pane="code">
            <div class="runbar">
              <button data-run>▶ 실행</button>
              <button class="ghost" data-stop disabled>■ 멈춤</button>
              <button class="ghost" data-full title="화면을 크게 해서 봐요">⛶ 크게</button>
              <details class="more-menu" data-more>
                <summary aria-label="더 보기">⋯</summary>
                <div class="more-pop">
                  <button class="ghost only-text" data-format title="들여쓰기를 한 번에 맞춰 줘요">✨ 코드 정리</button>
                  <button class="ghost only-blocks" data-example-blocks title="흔들면 하트가 나오는 예제 블록을 넣어요">🔰 예제 블록 넣기</button>
                  <button class="ghost" data-sub="help">📖 쓸 수 있는 값 보기</button>
                </div>
              </details>
              <span class="run-pill" data-pill role="status">⚪ 멈춰 있어요</span>
            </div>
            <div class="msg warn" data-dirty hidden>고친 내용은 "다시 실행"을 눌러야 적용돼요.</div>
            <div class="only-blocks block-wrap">
              <ol class="block-steps" aria-label="블록 쓰는 순서">
                <li><b>1</b> 왼쪽 묶음을 눌러요</li>
                <li><b>2</b> 블록을 끌어다 놓아요</li>
                <li><b>3</b> 블록끼리 딱 붙여요</li>
              </ol>
              <div class="blocks-host" data-blocks-host><p class="blocks-loading">🧩 블록을 불러오는 중이에요…</p></div>
              <div class="msg warn" data-blockwarn role="status" hidden></div>
            </div>
            <details class="snip-fold only-text">
              <summary>🧩 코드 조각 넣기 <small>누르면 코드에 들어가요</small></summary>
              <div class="snippets" aria-label="코드 조각 (누르면 넣어져요)"></div>
            </details>
            <p class="code-cap only-bridge">👀 블록이 만든 글 코드예요. 블록을 바꾸면 같이 바뀌어요. (읽기만 할 수 있어요)</p>
            <div class="editor">
              <pre class="gutter" aria-hidden="true"></pre>
              <textarea class="code-edit" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off"
                aria-label="규칙 코드 입력"></textarea>
            </div>
            <div class="msg bad" data-error role="alert" hidden></div>
            <div class="msg warn only-text" data-balance role="status" hidden></div>
            <details class="key-tips only-text">
              <summary>⌨️ 키보드 도움말</summary>
              <p class="small" style="margin:4px 0 0">괄호·따옴표는 저절로 닫혀요 · Enter = 자동 들여쓰기 · Tab / Shift+Tab = 들여쓰기 조절 · Ctrl(맥은 ⌘)+Enter = 실행</p>
            </details>
            </div>
            <div data-pane="help" hidden>
              <button class="ghost help-back" data-sub="code">← 규칙으로 돌아가기</button>
              <p class="small" style="margin:6px 0">모르는 게 있으면 펼쳐서 읽어 봐요. [코드창에 넣기]를 누르면 규칙 쓰는 곳으로 돌아가요.</p>
              <div class="help" data-help-body></div>
            </div>
            <div class="full-strip" aria-label="크게 보기 중 결과">
              <div class="led-grid mini" data-led-mini role="img" aria-label="가짜 LED 화면"></div>
              <div class="strip-vals" aria-label="센서값">
                <span>x <b data-val-mini="x">–</b></span><span>y <b data-val-mini="y">–</b></span><span>z <b data-val-mini="z">–</b></span>
                <span>세기 <b data-val-mini="m">–</b></span><span>흔들림 <b data-val-mini="s">–</b></span>
              </div>
              <span class="strip-log" data-log-mini aria-live="polite"></span>
            </div>
          </section>
        </div>
      </div>

      <section class="card card-predict">
        <h3 class="step-title">🔮 내 예상 <small>규칙을 만들기 전에, 먼저 생각해 봐요</small></h3>
        <p class="small" style="margin:0 0 8px">위의 그래프를 보고 떠올려 보세요. 어떤 규칙을 만들면, 마이크로비트가 어떻게 될 것 같아요? 나중에 실제 결과와 비교해 볼 거예요.</p>
        <input type="text" class="predict-input" data-predict maxlength="80" placeholder="예) 흔들면 세기 선이 커지니까, 300을 넘으면 하트가 나올 것 같아요" aria-label="내 예상">
      </section>
      <div class="step-nav" data-only="1">
        <button data-go="2">다음: 규칙 만들기 →</button>
      </div>
      <div class="step-nav" data-only="2">
        <button class="ghost" data-go="1">← 그래프 다시 보기</button>
        <button data-go="3">다음: 돌아보기 →</button>
      </div>

      <section class="card card-notes">
        <h3 class="step-title">🧪 내 실험 노트 <small>예상 → 결과 → 고칠 점을 적어 봐요</small></h3>
        <div data-notes></div>
      </section>
      <div class="step-nav" data-only="3">
        <button class="ghost" data-go="2">← 규칙 다시 고치기</button>
      </div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const codeEl = $('.code-edit');
  const runBtn = $('[data-run]');
  const stopBtn = $('[data-stop]');
  const dirtyEl = $('[data-dirty]');
  const errEl = $('[data-error]');
  const logEl = $('[data-log]');
  const connMsg = $('[data-connmsg]');
  const simBar = $('[data-simbar]');
  $('[data-stop-sim]').addEventListener('click', () => conn.disconnect());
  const chart = new LiveChart($('canvas'), { series: SERIES });

  // 가짜 LED 25칸
  const ledEl = $('[data-led]');
  const cells = Array.from({ length: 25 }, () => ledEl.appendChild(document.createElement('i')));
  const miniEl = $('[data-led-mini]');
  const miniCells = Array.from({ length: 25 }, () => miniEl.appendChild(document.createElement('i')));
  function showLed(name) {
    const rows = ICON_ROWS[name] ?? ICON_ROWS.clear;
    for (const list of [cells, miniCells]) list.forEach((c, i) => c.classList.toggle('on', rows[Math.floor(i / 5)][i % 5] === '1'));
  }
  showLed('clear');

  // 코드 조각 버튼 (묶음별)
  const snipBox = $('.snippets');
  for (const [group, items] of SNIPPET_GROUPS) {
    const row = document.createElement('div');
    row.className = 'snip-group';
    const name = document.createElement('span');
    name.textContent = group;
    row.append(name);
    for (const [label, text, back, hint] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost';
      b.textContent = label;
      b.title = hint;
      b.addEventListener('click', () => insertAtCursor(text, back));
      row.append(b);
    }
    snipBox.append(row);
  }

  function insertAtCursor(text, back) {
    const { selectionStart: s, selectionEnd: e, value } = codeEl;
    codeEl.value = value.slice(0, s) + text + value.slice(e);
    const pos = s + text.length - back;
    codeEl.focus();
    codeEl.setSelectionRange(pos, pos);
    onCodeChanged();
  }

  // 줄 번호
  const gutter = $('.gutter');
  function updateGutter() {
    const n = codeEl.value.split('\n').length;
    gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
  }
  codeEl.addEventListener('scroll', () => {
    gutter.scrollTop = codeEl.scrollTop;
  });

  // 시작 가이드: 처음 한 번 자동으로 펼치고, ❓ 도움말로 다시 볼 수 있다
  const guideEl = $('[data-guide]');
  const helpBtn = $('[data-help]');
  $('.guide-try pre').textContent = EXAMPLE;
  function showGuide(on) {
    guideEl.hidden = !on;
    helpBtn.setAttribute('aria-expanded', String(on));
    if (on) guideEl.scrollIntoView({ block: 'nearest' });
  }
  let seen = false;
  try {
    seen = localStorage.getItem(GUIDE_KEY) === '1';
  } catch {
    // 저장이 막혀도 가이드는 보여 준다
  }
  showGuide(!seen);
  helpBtn.addEventListener('click', () => showGuide(guideEl.hidden));
  $('[data-guide-close]').addEventListener('click', () => {
    showGuide(false);
    try {
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      // 저장 실패는 무시
    }
  });
  $('[data-example]').addEventListener('click', () => {
    const cur = codeEl.value.trim();
    if (level !== 'text') {
      loadExampleBlocks();
      goStep(2);
      return;
    }
    if (cur && cur !== STARTER.trim() && cur !== EXAMPLE.trim() && !confirm('지금 쓴 코드가 예제로 바뀌어요. 괜찮아요?')) return;
    codeEl.value = EXAMPLE;
    onCodeChanged();
    goStep(2);
    codeEl.focus();
  });

  // 연결 전 안내 카드의 버튼 = 위쪽 연결 바의 버튼을 대신 눌러 준다
  const clickTop = (id) => document.getElementById(id)?.click();
  $('[data-start-sim]').addEventListener('click', () => clickTop('btn-sim'));
  $('[data-start-usb]').addEventListener('click', () => clickTop('btn-connect'));

  // 저장된 글 코드 불러오기 (블록으로 만든 코드는 따로 저장되니 글 코드와 섞이지 않는다)
  let savedText = null;
  try {
    savedText = localStorage.getItem(CODE_KEY);
  } catch {
    // 저장을 못 읽으면 새로 시작한다
  }
  let textCode = savedText || STARTER; // 🌳 글 코드 방식에서 쓰던 코드
  let level = 'text';
  let blocks = null;
  let destroyed = false;
  codeEl.value = textCode;

  // ---------- 단계 탭 ----------
  const page = $('.rules-page');
  const STEP_KEY = 'microlab.rules.step';
  const tabBtns = root.querySelectorAll('[data-tab]');
  function goStep(n, { scroll = true } = {}) {
    page.dataset.step = String(n);
    tabBtns.forEach((b) => {
      const on = b.dataset.tab === String(n);
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    try {
      sessionStorage.setItem(STEP_KEY, String(n));
    } catch {
      // 저장이 막혀도 탭은 움직인다
    }
    if (scroll) page.scrollIntoView({ block: 'start' });
  }
  tabBtns.forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.tab))));
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.go))));

  // 코드 ⇄ 쓸 수 있는 값
  const subBtns = root.querySelectorAll('[data-sub]');
  function showSub(name) {
    root.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== name));
    subBtns.forEach((b) => {
      const on = b.dataset.sub === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
  }
  const moreMenu = $('[data-more]');
  subBtns.forEach((b) =>
    b.addEventListener('click', () => {
      showSub(b.dataset.sub);
      moreMenu.open = false;
    }),
  );
  moreMenu.addEventListener('click', (e) => {
    if (e.target.closest('button')) moreMenu.open = false; // 메뉴 안 버튼을 누르면 닫는다
  });
  const closeMoreOutside = (e) => {
    if (moreMenu.open && !moreMenu.contains(e.target)) moreMenu.open = false;
  };
  document.addEventListener('pointerdown', closeMoreOutside);

  // ⛶ 크게 보기: 규칙 쓰기 카드를 화면 가득 채운다 (Esc나 ✕로 닫기). 실행은 그대로 이어진다.
  const cardCode = $('[data-card-code]');
  const fullBtn = $('[data-full]');
  const fullClose = $('[data-full-close]');
  function setFull(on) {
    cardCode.classList.toggle('is-full', on);
    page.classList.toggle('has-full', on);
    fullClose.hidden = !on;
    fullBtn.textContent = on ? '✕ 작게' : '⛶ 크게';
    document.body.style.overflow = on ? 'hidden' : '';
    if (on) {
      cardCode.setAttribute('role', 'dialog');
      cardCode.setAttribute('aria-modal', 'true');
      fullClose.focus();
    } else {
      cardCode.removeAttribute('role');
      cardCode.removeAttribute('aria-modal');
      fullBtn.focus();
    }
    requestAnimationFrame(() => blocks?.resize());
  }
  fullBtn.addEventListener('click', () => setFull(!cardCode.classList.contains('is-full')));
  fullClose.addEventListener('click', () => setFull(false));
  const onFullKey = (e) => {
    if (e.key === 'Escape' && cardCode.classList.contains('is-full')) setFull(false);
  };
  document.addEventListener('keydown', onFullKey);
  showSub('code');
  let startStep = 1;
  try {
    startStep = Number(sessionStorage.getItem(STEP_KEY)) || 1;
  } catch {
    // 없으면 1단계부터
  }
  goStep(startStep >= 1 && startStep <= 3 ? startStep : 1, { scroll: false });

  mountHelp($('[data-help-body]'), {
    icons: ICON_ROWS,
    insert(code, where) {
      if (level !== 'text') return; // 블록 방식에서는 예시를 눈으로만 본다
      showSub('code');
      if (where === 'end') {
        codeEl.value = codeEl.value.replace(/\s+$/, '') + '\n\n' + code + '\n';
        onCodeChanged();
        codeEl.focus();
        codeEl.scrollTop = codeEl.scrollHeight;
      } else {
        insertAtCursor(code, 0);
      }
    },
  });
  const missions = mountMissions($('[data-missions]'));
  const notes = mountNotes($('[data-notes]'), {
    setCode(code) {
      loadTextCode(code); // 예전 시도는 글 코드로 불러온다
    },
    getMissionTitle: () => missions.get()?.title ?? '',
  });

  // 내 예상: ① 탭과 ② 탭의 칸이 같은 값을 쓴다
  const predictInputs = root.querySelectorAll('[data-predict]');
  predictInputs.forEach((inp) => {
    inp.addEventListener('input', () => notes.setDraft(inp.value));
  });
  const offDraft = notes.onDraft((text) => {
    predictInputs.forEach((inp) => {
      if (inp.value !== text) inp.value = text;
    });
  });
  predictInputs.forEach((inp) => (inp.value = notes.getDraft()));

  const pills = root.querySelectorAll('[data-pill]');
  function updatePill() {
    const text = !running ? '⚪ 멈춰 있어요' : conn.connected ? '🟢 실행 중' : '🟢 실행 중 · 센서값을 기다려요';
    pills.forEach((pill) => {
      pill.classList.toggle('on', running);
      pill.textContent = text;
    });
  }

  let running = false;
  let ranCode = '';
  let lastIcon = null;
  let saveTimer = 0;

  // ---------- 규칙 실행 ----------
  const runner = new RuleRunner({
    onAction(name, arg) {
      if (name === 'icon') showIcon(arg);
      else if (name === 'say') addLog('💬 ' + arg);
      else if (name === 'jump') addLog('🦘 점프!');
    },
    onReady({ hasLoop, hasButton }) {
      if (!hasLoop && !hasButton) {
        showError(
          level === 'text'
            ? '아직 반복() 함수가 없어요. 센서값에 따라 움직이게 하려면 function 반복() { … } 안에 규칙을 써요.'
            : '아직 "🚦 언제" 블록이 없어요. 왼쪽 🚦 언제 묶음에서 블록을 가져와 놓아 보세요.',
          null,
        );
      }
    },
    onError({ message, line }) {
      setRunning(false);
      showError(message, line);
    },
  });

  function showIcon(name) {
    showLed(name);
    if (name !== lastIcon && conn.connected) {
      Promise.resolve(conn.send('icon:' + name)).catch(() => {});
    }
    lastIcon = name;
  }

  // 같은 글이 계속 오면 줄을 늘리지 않고 횟수만 올린다
  let lastLog = { text: '', n: 0, li: null };
  const logMini = $('[data-log-mini]');
  function addLog(text) {
    logMini.textContent = text;
    if (lastLog.li && lastLog.text === text) {
      lastLog.n++;
      lastLog.li.textContent = `${text}  ×${lastLog.n}`;
      return;
    }
    const li = document.createElement('li');
    li.textContent = text;
    logEl.prepend(li);
    while (logEl.children.length > 6) logEl.lastChild.remove();
    lastLog = { text, n: 1, li };
  }
  function clearLog() {
    logEl.replaceChildren();
    logMini.textContent = '';
    lastLog = { text: '', n: 0, li: null };
  }

  function showError(message, line) {
    errEl.hidden = false;
    const hint = level === 'text' ? bracketHint(codeEl.value) : '';
    const where = line && level !== 'block' ? `${line}번째 줄 근처: ` : '';
    errEl.textContent = where + message + (hint ? ' → ' + hint : '');
  }

  function setRunning(on) {
    running = on;
    runBtn.textContent = on ? '🔁 다시 실행' : '▶ 실행';
    stopBtn.disabled = !on;
    updatePill();
    if (!on) dirtyEl.hidden = true;
    if (!on) {
      showLed('clear');
      if (lastIcon && lastIcon !== 'clear' && conn.connected) {
        Promise.resolve(conn.send('icon:clear')).catch(() => {});
      }
      lastIcon = null;
    }
  }

  function run() {
    errEl.hidden = true;
    dirtyEl.hidden = true;
    clearLog();
    ranCode = codeEl.value;
    try {
      localStorage.setItem('microlab.rules.ran', ranCode); // 점프 게임에서 '내 규칙'으로 쓴다
    } catch {
      // 저장이 막힌 브라우저에서는 게임에서 못 쓴다
    }
    notes.addVersion(ranCode);
    lastIcon = null;
    showLed('clear');
    runner.start(ranCode);
    running = true;
    runBtn.textContent = '🔁 다시 실행';
    stopBtn.disabled = false;
    updatePill();
  }

  function stop() {
    runner.stop();
    setRunning(false);
  }

  runBtn.addEventListener('click', run);
  stopBtn.addEventListener('click', stop);

  // ---------- 코드 입력 ----------
  const balanceEl = $('[data-balance]');
  let balanceTimer = 0;
  function onCodeChanged() {
    updateGutter();
    clearTimeout(balanceTimer);
    balanceTimer = setTimeout(() => {
      const hint = bracketHint(codeEl.value);
      balanceEl.hidden = !hint;
      balanceEl.textContent = hint ? '🔎 ' + hint : '';
    }, 700);
    chart.setLines(findLines(codeEl.value));
    if (running) dirtyEl.hidden = codeEl.value === ranCode;
    clearTimeout(saveTimer);
    if (level === 'text') saveTimer = setTimeout(saveText, 400);
  }
  function saveText() {
    try {
      localStorage.setItem(CODE_KEY, codeEl.value);
    } catch {
      // 저장이 막힌 브라우저에서는 이번에만 기억한다
    }
  }
  codeEl.addEventListener('input', onCodeChanged);
  const detachAssist = attachEditorAssist(codeEl, { onRun: run });
  $('[data-format]').addEventListener('click', () => {
    const t = formatCode(codeEl.value);
    if (t !== codeEl.value) {
      codeEl.select();
      if (!document.execCommand('insertText', false, t)) {
        codeEl.value = t;
        onCodeChanged();
      }
    }
    codeEl.focus();
  });
  onCodeChanged();

  // ---------- 코딩 방식 (블록 / 블록+코드 / 글 코드) ----------
  const levelBox = $('[data-levels]');
  const blockHost = $('[data-blocks-host]');
  const blockWarn = $('[data-blockwarn]');
  const levelBtns = {};
  for (const [key, [title, desc]] of Object.entries(LEVELS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost';
    btn.dataset.level = key;
    btn.setAttribute('role', 'radio');
    const t = document.createElement('b');
    t.textContent = title;
    const d = document.createElement('small');
    d.textContent = desc;
    btn.title = desc;
    btn.append(t, d);
    btn.addEventListener('click', () => setLevel(key));
    levelBox.append(btn);
    levelBtns[key] = btn;
  }

  function paintLevel() {
    page.dataset.level = level;
    for (const [key, btn] of Object.entries(levelBtns)) {
      btn.classList.toggle('on', key === level);
      btn.setAttribute('aria-checked', String(key === level));
    }
    codeEl.readOnly = level !== 'text';
    blocks?.resize();
  }

  // 블록이 바뀔 때마다 글 코드를 새로 만들어 코드창에 보여 준다
  function onBlocksChanged({ code, stray }) {
    if (level === 'text') return;
    blockHost.closest('.block-wrap').classList.toggle('started', blocks ? blocks.blockCount() > 1 : false);
    blockWarn.hidden = stray === 0;
    blockWarn.textContent = stray ? `🧩 어디에도 붙지 않은 블록이 ${stray}개 있어요. 🚦 언제 블록에 붙여야 실행돼요.` : '';
    if (codeEl.value !== code) {
      codeEl.value = code;
      onCodeChanged();
    }
  }

  function setLevel(next, { useText = false } = {}) {
    if (next === level) return;
    if (next !== 'text' && !blocks) return; // 블록 도구가 아직 안 왔다
    if (level === 'text') {
      textCode = codeEl.value;
      clearTimeout(saveTimer);
      saveText();
    }
    let code;
    if (next === 'text') {
      const gen = blocks?.getResult();
      const own = textCode.trim() !== '' && textCode.trim() !== STARTER.trim();
      if (useText || !gen?.hasRule) code = textCode;
      else if (!own) code = gen.code;
      else if (gen.code === textCode) code = textCode;
      else code = confirm('블록으로 만든 코드를 글 코드로 가져올까요?\n"취소"를 누르면 전에 쓰던 글 코드가 그대로 나와요.') ? gen.code : textCode;
    } else {
      code = blocks.getResult().code;
    }
    level = next;
    blockWarn.hidden = true;
    codeEl.value = code;
    paintLevel();
    onCodeChanged();
    if (next !== 'text') onBlocksChanged(blocks.getResult());
    try {
      localStorage.setItem(LEVEL_KEY, next);
    } catch {
      // 저장이 막혀도 이번 화면에서는 바뀐다
    }
  }

  // 글 코드를 통째로 넣는다 (실험 노트 되돌리기 등). 블록으로는 바꿀 수 없으니 글 코드 방식으로 보여 준다.
  function loadTextCode(code) {
    textCode = code;
    if (level === 'text') {
      codeEl.value = code;
      onCodeChanged();
    } else {
      setLevel('text', { useText: true });
    }
    codeEl.focus();
  }

  function loadExampleBlocks() {
    if (!blocks) return;
    if (blocks.blockCount() > 1 && !confirm('지금 만든 블록이 예제로 바뀌어요. 괜찮아요?')) return;
    blocks.loadExample();
  }
  $('[data-example-blocks]').addEventListener('click', loadExampleBlocks);

  // 처음 방식: 주소(?level=) → 저장된 선택 → 쓰던 글 코드가 있으면 글, 없으면 블록
  let wanted = new URLSearchParams(location.hash.split('?')[1] || '').get('level');
  if (!LEVELS[wanted]) {
    try {
      wanted = localStorage.getItem(LEVEL_KEY);
    } catch {
      wanted = null;
    }
  }
  if (!LEVELS[wanted]) wanted = savedText && savedText.trim() !== STARTER.trim() ? 'text' : 'block';

  paintLevel();
  if (wanted !== 'text') {
    level = wanted;
    codeEl.value = '';
    paintLevel();
    mountBlocks(blockHost, { onChange: onBlocksChanged })
      .then((api) => {
        if (destroyed) return api.dispose();
        blockHost.querySelector('.blocks-loading')?.remove();
        blocks = api;
        paintLevel();
        onBlocksChanged(api.getResult());
      })
      .catch((err) => {
        if (destroyed) return;
        level = 'block';
        blockHost.textContent = '';
        setLevel('text', { useText: true });
        errEl.hidden = false;
        errEl.textContent = '블록 도구를 불러오지 못해서 글 코드로 열었어요. (' + err.message + ')';
      });
  } else {
    // 글 코드로 시작해도 블록 방식으로 바꿀 수 있게 미리 준비해 둔다
    mountBlocks(blockHost, { onChange: onBlocksChanged })
      .then((api) => {
        if (destroyed) return api.dispose();
        blockHost.querySelector('.blocks-loading')?.remove();
        blocks = api;
      })
      .catch(() => {
        Object.values(levelBtns).forEach((btn) => btn.dataset.level !== 'text' && (btn.disabled = true));
      });
  }

  // ---------- 센서값 ----------
  let last = null;
  function refreshConn() {
    connMsg.hidden = conn.connected;
    simBar.hidden = !(conn.connected && conn.kind === 'simulator');
    updatePill();
  }

  const offs = [
    conn.on('sample', (s) => {
      last = s;
      const m = Math.round(Math.hypot(s.x, s.y, s.z));
      chart.push({ x: s.x, y: s.y, z: s.z, m });
      runner.push(s);
    }),
    conn.on('button', ({ name }) => runner.button(name)),
    conn.on('status', ({ state }) => {
      if (state === 'disconnected') {
        chart.clear();
        last = null;
        root.querySelectorAll('[data-val], [data-val-mini]').forEach((el) => (el.textContent = '–'));
      }
      refreshConn();
    }),
  ];
  refreshConn();

  // 숫자는 0.25초마다 갱신 (너무 자주 바꾸면 읽기 힘들다)
  const timer = setInterval(() => {
    if (!last) return;
    const m = Math.round(Math.hypot(last.x, last.y, last.z));
    const vals = { x: last.x, y: last.y, z: last.z, m, s: Math.abs(m - 1024) };
    for (const [k, v] of Object.entries(vals)) {
      $(`[data-val="${k}"]`).textContent = v;
      $(`[data-val-mini="${k}"]`).textContent = v;
    }
  }, 250);

  return () => {
    offs.forEach((off) => off());
    clearInterval(timer);
    clearTimeout(saveTimer);
    clearTimeout(balanceTimer);
    detachAssist();
    offDraft();
    document.removeEventListener('pointerdown', closeMoreOutside);
    document.removeEventListener('keydown', onFullKey);
    document.body.style.overflow = '';
    destroyed = true;
    if (level === 'text') saveText();
    blocks?.dispose();
    runner.stop();
    notes.destroy();
    if (lastIcon && lastIcon !== 'clear' && conn.connected) {
      Promise.resolve(conn.send('icon:clear')).catch(() => {});
    }
    chart.destroy();
  };
}
