// 블록 편집기: Blockly로 규칙을 블록으로 만들고, 같은 규칙의 글 코드로 바꿔 준다.
// 블록 모양·색·이름은 이 파일에서만 정한다. 실행은 기존 글 코드 실행기를 그대로 쓴다.

const BLOCKS_KEY = 'microlab.rules.blocks';
const BASE = new URL('../../vendor/blockly/', import.meta.url).href;

// 색으로 종류를 구분한다 (도구상자와 블록이 같은 색)
const COLOR = { event: '#f59e0b', logic: '#3b82f6', sensor: '#0d9488', led: '#ec4899', act: '#8b5cf6' };

const SENSORS = [['x (좌우)', 'x'], ['y (앞뒤)', 'y'], ['z (위아래)', 'z'], ['세기', '세기'], ['흔들림', '흔들림']];
const OPS = [['>', '>'], ['<', '<'], ['=', '=='], ['≥', '>='], ['≤', '<=']];
const ICONS = [['❤️ 하트', '하트'], ['😀 웃음', '웃음'], ['😢 울음', '울음'], ['✅ 예', '예'], ['❌ 아니오', '아니오'], ['⬛ 끄기', '끄기']];
const HATS = { rule_loop: '반복', rule_btn_a: '버튼A눌림', rule_btn_b: '버튼B눌림' };

let loading = null;

function addScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('블록 도구를 불러오지 못했어요'));
    document.head.append(s);
  });
}

// Blockly는 처음 필요할 때 한 번만 불러온다
export function loadBlockly() {
  if (!loading) {
    loading = (async () => {
      if (!window.Blockly) {
        await addScript(BASE + 'blockly.min.js');
        await addScript(BASE + 'ko.js').catch(() => {}); // 한국어 기본 메뉴(없어도 동작)
      }
      defineBlocks(window.Blockly);
      return window.Blockly;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

let defined = false;
function defineBlocks(B) {
  if (defined) return;
  defined = true;
  const stack = { previousStatement: null, nextStatement: null };
  B.defineBlocksWithJsonArray([
    {
      type: 'rule_loop', message0: '🚦 센서값이 올 때마다', message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }], colour: COLOR.event,
      tooltip: '마이크로비트가 센서값을 보낼 때마다 아래 블록이 실행돼요. (1초에 약 50번)',
    },
    {
      type: 'rule_btn_a', message0: '🅰️ A 버튼을 누르면', message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }], colour: COLOR.event,
      tooltip: 'A 버튼을 누를 때 한 번 실행돼요.',
    },
    {
      type: 'rule_btn_b', message0: '🅱️ B 버튼을 누르면', message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }], colour: COLOR.event,
      tooltip: 'B 버튼을 누를 때 한 번 실행돼요.',
    },
    {
      type: 'rule_if', message0: '만약 %1 이면', args0: [{ type: 'input_value', name: 'IF', check: 'Boolean' }],
      message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }], ...stack, colour: COLOR.logic,
      tooltip: '조건이 맞을 때만 안의 블록을 실행해요.',
    },
    {
      type: 'rule_ifelse', message0: '만약 %1 이면', args0: [{ type: 'input_value', name: 'IF', check: 'Boolean' }],
      message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }],
      message2: '아니면', message3: '%1', args3: [{ type: 'input_statement', name: 'ELSE' }],
      ...stack, colour: COLOR.logic,
      tooltip: '조건이 맞으면 위쪽 블록을, 아니면 아래쪽 블록을 실행해요.',
    },
    {
      type: 'rule_cmp_sensor', message0: '%1 %2 %3',
      args0: [
        { type: 'field_dropdown', name: 'SENSOR', options: SENSORS },
        { type: 'field_dropdown', name: 'OP', options: OPS },
        { type: 'field_number', name: 'NUM', value: 300 },
      ],
      output: 'Boolean', colour: COLOR.sensor,
      tooltip: '센서값을 숫자와 견줘요. > 는 "보다 커요", < 는 "보다 작아요", = 는 "똑같아요"예요.',
    },
    {
      type: 'rule_cmp', message0: '%1 %2 %3',
      args0: [
        { type: 'input_value', name: 'A', check: 'Number' },
        { type: 'field_dropdown', name: 'OP', options: OPS },
        { type: 'input_value', name: 'B', check: 'Number' },
      ],
      inputsInline: true, output: 'Boolean', colour: COLOR.sensor,
      tooltip: '숫자 두 개를 견줘요. 센서값 블록이나 숫자 블록을 끼워요.',
    },
    {
      type: 'rule_and', message0: '%1 %2 %3',
      args0: [
        { type: 'input_value', name: 'A', check: 'Boolean' },
        { type: 'field_dropdown', name: 'OP', options: [['그리고', '&&'], ['또는', '||']] },
        { type: 'input_value', name: 'B', check: 'Boolean' },
      ],
      inputsInline: true, output: 'Boolean', colour: COLOR.logic,
      tooltip: '"그리고"는 둘 다 맞아야 하고, "또는"은 하나만 맞아도 돼요.',
    },
    {
      type: 'rule_sensor', message0: '%1', args0: [{ type: 'field_dropdown', name: 'SENSOR', options: SENSORS }],
      output: 'Number', colour: COLOR.sensor, tooltip: '지금 센서값이에요. 마이크로비트를 움직이면 바뀌어요.',
    },
    {
      type: 'rule_number', message0: '%1', args0: [{ type: 'field_number', name: 'NUM', value: 300 }],
      output: 'Number', colour: COLOR.sensor, tooltip: '숫자예요. 눌러서 바꿔 봐요.',
    },
    {
      type: 'rule_led', message0: '💡 LED에 %1 보여주기', args0: [{ type: 'field_dropdown', name: 'ICON', options: ICONS }],
      ...stack, colour: COLOR.led, tooltip: '마이크로비트 LED(와 화면의 가짜 LED)에 그림을 보여 줘요.',
    },
    {
      type: 'rule_say', message0: '💬 말하기 %1', args0: [{ type: 'field_input', name: 'TEXT', text: '안녕!' }],
      ...stack, colour: COLOR.act, tooltip: '화면의 말풍선에 글을 남겨요.',
    },
    {
      type: 'rule_jump', message0: '🦘 점프 신호 보내기', ...stack, colour: COLOR.act,
      tooltip: '점프 게임으로 점프 신호를 보내요.',
    },
  ]);
}

// ---------- 도구상자 (찾기 쉽게 묶음 + 안내 글) ----------
const b = (type, fields) => ({ kind: 'block', type, ...(fields ? { fields } : {}) });
const label = (text) => ({ kind: 'label', text });
const cmp = (SENSOR, OP, NUM) => b('rule_cmp_sensor', { SENSOR, OP, NUM });

const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: '🚦 언제', colour: COLOR.event,
      contents: [label('언제 실행할까요? 맨 위에 하나 놓아요'), b('rule_loop'), b('rule_btn_a'), b('rule_btn_b')],
    },
    {
      kind: 'category', name: '🔀 만약', colour: COLOR.logic,
      contents: [
        label('이럴 때만 실행해요'), b('rule_if'), b('rule_ifelse'),
        label('그리고 / 또는'), b('rule_and'),
      ],
    },
    {
      kind: 'category', name: '📡 센서', colour: COLOR.sensor,
      contents: [
        label('센서값 견주기 (눌러서 바꿔요)'),
        cmp('흔들림', '>', 300), cmp('x', '>', 300), cmp('x', '<', -300), cmp('y', '>', 300), cmp('y', '<', -300), cmp('세기', '>', 1500),
        label('직접 짜 맞추기'), b('rule_cmp'), b('rule_sensor'), b('rule_number'),
      ],
    },
    {
      kind: 'category', name: '💡 LED', colour: COLOR.led,
      contents: [label('LED에 그림 보여 주기'), ...ICONS.map(([, v]) => b('rule_led', { ICON: v }))],
    },
    {
      kind: 'category', name: '💬 말하기·점프', colour: COLOR.act,
      contents: [label('말하고 점프해요'), b('rule_say'), b('rule_jump')],
    },
  ],
};

// ---------- 블록 → 글 코드 ----------
const IND = '  ';

function numberOf(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function expr(block) {
  if (!block) return 'false';
  switch (block.type) {
    case 'rule_cmp_sensor':
      return `${block.getFieldValue('SENSOR')} ${block.getFieldValue('OP')} ${numberOf(block.getFieldValue('NUM'))}`;
    case 'rule_cmp':
      return `${num(block.getInputTargetBlock('A'))} ${block.getFieldValue('OP')} ${num(block.getInputTargetBlock('B'))}`;
    case 'rule_and': {
      const a = block.getInputTargetBlock('A');
      const c = block.getInputTargetBlock('B');
      const wrap = (t) => (t && t.type === 'rule_and' ? `(${expr(t)})` : expr(t));
      return `${wrap(a)} ${block.getFieldValue('OP')} ${wrap(c)}`;
    }
    default:
      return 'false';
  }
}

function num(block) {
  if (!block) return '0';
  if (block.type === 'rule_sensor') return block.getFieldValue('SENSOR');
  if (block.type === 'rule_number') return String(numberOf(block.getFieldValue('NUM')));
  return '0';
}

function quote(text) {
  return '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"';
}

function stmts(first, depth) {
  const pad = IND.repeat(depth);
  const out = [];
  for (let blk = first; blk; blk = blk.getNextBlock()) {
    if (!blk.isEnabled()) continue;
    switch (blk.type) {
      case 'rule_led':
        out.push(`${pad}${blk.getFieldValue('ICON')}()`);
        break;
      case 'rule_say':
        out.push(`${pad}말하기(${quote(blk.getFieldValue('TEXT'))})`);
        break;
      case 'rule_jump':
        out.push(`${pad}점프()`);
        break;
      case 'rule_if':
        out.push(`${pad}if (${expr(blk.getInputTargetBlock('IF'))}) {`);
        out.push(...stmts(blk.getInputTargetBlock('DO'), depth + 1));
        out.push(`${pad}}`);
        break;
      case 'rule_ifelse':
        out.push(`${pad}if (${expr(blk.getInputTargetBlock('IF'))}) {`);
        out.push(...stmts(blk.getInputTargetBlock('DO'), depth + 1));
        out.push(`${pad}} else {`);
        out.push(...stmts(blk.getInputTargetBlock('ELSE'), depth + 1));
        out.push(`${pad}}`);
        break;
      default:
        break;
    }
  }
  return out;
}

// 같은 종류의 "언제" 블록이 여러 개면 한 함수로 합친다
export function generateCode(ws) {
  const bodies = {};
  let stray = 0;
  for (const top of ws.getTopBlocks(true)) {
    const fn = HATS[top.type];
    if (!fn) {
      if (top.isEnabled()) stray++;
      continue;
    }
    if (!top.isEnabled()) continue;
    (bodies[fn] ??= []).push(...stmts(top.getInputTargetBlock('DO'), 1));
  }
  const parts = [];
  for (const fn of Object.values(HATS)) {
    if (bodies[fn]) parts.push(`function ${fn}() {\n${bodies[fn].join('\n')}${bodies[fn].length ? '\n' : ''}}`);
  }
  const code = parts.length
    ? '// 블록으로 만든 규칙이에요.\n' + parts.join('\n\n') + '\n'
    : '// 🚦 언제 블록을 가져와 놓고, 그 안에 블록을 끼워 보세요.\n';
  return { code, stray, hasRule: parts.length > 0 };
}

// ---------- 시작·예제 블록 ----------
const chain = (...blocks) => {
  let next;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const blk = { ...blocks[i] };
    if (next) blk.next = { block: next };
    next = blk;
  }
  return next;
};
const statement = (...blocks) => ({ block: chain(...blocks) });
const wrap = (blocks) => ({ blocks: { languageVersion: 0, blocks } });

const STARTER_STATE = wrap([{ type: 'rule_loop', x: 24, y: 24 }]);
const EXAMPLE_STATE = wrap([
  {
    type: 'rule_loop', x: 24, y: 24,
    inputs: {
      DO: statement({
        type: 'rule_ifelse',
        inputs: {
          IF: { block: { type: 'rule_cmp_sensor', fields: { SENSOR: '흔들림', OP: '>', NUM: 300 } } },
          DO: statement({ type: 'rule_led', fields: { ICON: '하트' } }),
          ELSE: statement({ type: 'rule_led', fields: { ICON: '끄기' } }),
        },
      }),
    },
  },
]);

// ---------- 작업 영역 ----------
function makeTheme(B, dark) {
  const c = dark
    ? { bg: '#12141c', tool: '#1b1e29', fly: '#232748', text: '#eceef5', scroll: '#4a5070' }
    : { bg: '#f7f8fd', tool: '#ffffff', fly: '#eef0ff', text: '#1d2433', scroll: '#c0c5dd' };
  return B.Theme.defineTheme(dark ? 'microlabDark' : 'microlab', {
    name: dark ? 'microlabDark' : 'microlab',
    base: B.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: c.bg,
      toolboxBackgroundColour: c.tool,
      toolboxForegroundColour: c.text,
      flyoutBackgroundColour: c.fly,
      flyoutForegroundColour: c.text,
      flyoutOpacity: 1,
      scrollbarColour: c.scroll,
      scrollbarOpacity: 0.8,
      insertionMarkerColour: '#4f46e5',
      insertionMarkerOpacity: 0.3,
    },
    fontStyle: { family: 'inherit', weight: '700', size: 13 },
  });
}

export async function mountBlocks(host, { onChange }) {
  const B = await loadBlockly();
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const ws = B.inject(host, {
    toolbox: TOOLBOX,
    renderer: 'zelos',
    theme: makeTheme(B, !!dark),
    media: BASE + 'media/',
    sounds: false,
    trashcan: true,
    grid: { spacing: 24, length: 2, colour: dark ? '#2b3042' : '#dfe3f1', snap: true },
    zoom: { controls: true, wheel: false, startScale: host.clientWidth < 520 ? 0.7 : 0.95, maxScale: 1.5, minScale: 0.55, scaleSpeed: 1.15 },
    move: { scrollbars: true, drag: true, wheel: false },
  });

  const ro = new ResizeObserver(() => B.svgResize(ws));
  ro.observe(host);

  function load(state) {
    muted = true;
    try {
      ws.clear();
      B.serialization.workspaces.load(state, ws);
    } finally {
      muted = false;
    }
    emit();
  }

  let muted = false;
  let saveTimer = 0;
  function emit() {
    const result = generateCode(ws);
    onChange(result);
  }
  function save() {
    try {
      localStorage.setItem(BLOCKS_KEY, JSON.stringify(B.serialization.workspaces.save(ws)));
    } catch {
      // 저장이 막혀도 이번 화면에서는 계속 쓸 수 있다
    }
  }

  let state = STARTER_STATE;
  try {
    const raw = localStorage.getItem(BLOCKS_KEY);
    if (raw) state = JSON.parse(raw);
  } catch {
    state = STARTER_STATE;
  }
  try {
    load(state);
  } catch {
    load(STARTER_STATE);
  }

  // 어디에도 붙지 않은 블록은 회색으로 꺼서, 실행되지 않는다는 걸 바로 보여 준다
  ws.addChangeListener(B.Events.disableOrphans);
  ws.addChangeListener((e) => {
    if (muted || e.isUiEvent) return;
    emit();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  });

  return {
    getResult: () => generateCode(ws),
    blockCount: () => ws.getAllBlocks(false).length,
    loadStarter: () => load(STARTER_STATE),
    loadExample: () => load(EXAMPLE_STATE),
    resize: () => B.svgResize(ws),
    dispose() {
      clearTimeout(saveTimer);
      save();
      ro.disconnect();
      ws.dispose();
    },
  };
}
