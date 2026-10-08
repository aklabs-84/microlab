import { Connection } from '../shared/device/connection.js';
import { MODES, GROUPS } from './modes.js';
import { buildNav } from './nav.js';

const $ = (id) => document.getElementById(id);
const conn = new Connection();
const nav = buildNav({ bar: document.getElementById('topnav'), current: 'home' });
let noDataTimer = null;
let baseStatus = '';

// ---------- 연결 바 (모든 모드에서 공통) ----------
function setStatus(text, kind = '') {
  const el = $('status');
  baseStatus = text;
  el.textContent = text;
  el.className = 'status ' + kind;
}

function showMsg(text, kind = '') {
  const el = $('msg');
  el.hidden = !text;
  el.textContent = text || '';
  el.className = 'msg ' + kind;
}

// "센서 켜기" 선택 창 열고 닫기
function togglePick(open) {
  const pick = $('connect-pick');
  const next = open ?? pick.hidden;
  pick.hidden = !next;
  $('btn-start').setAttribute('aria-expanded', String(next));
}

function setConnectedUI(on, kind) {
  $('btn-start').hidden = on;
  togglePick(false);
  $('btn-disconnect').hidden = !on;
  $('btn-disconnect').textContent = on && kind === 'simulator' ? '⏹ 멈추기' : '센서 끄기';
  $('sim-float').hidden = !(on && kind === 'simulator');
}

// 연습 판: 제목줄을 끌어서 옮기고, 접기 버튼으로 작게 줄인다.
(() => {
  const box = $('sim-float');
  const bar = $('pad-bar');
  const fold = $('pad-fold');
  fold.addEventListener('click', () => {
    const folded = box.classList.toggle('folded');
    fold.textContent = folded ? '펴기' : '접기';
    fold.setAttribute('aria-expanded', String(!folded));
  });
  let grab = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target === fold) return;
    const r = box.getBoundingClientRect();
    grab = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    bar.setPointerCapture(e.pointerId);
    bar.classList.add('dragging');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!grab) return;
    const x = Math.max(0, Math.min(window.innerWidth - box.offsetWidth, e.clientX - grab.dx));
    const y = Math.max(0, Math.min(window.innerHeight - box.offsetHeight, e.clientY - grab.dy));
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.right = 'auto';
    box.style.bottom = 'auto';
  });
  const drop = () => {
    grab = null;
    bar.classList.remove('dragging');
  };
  bar.addEventListener('pointerup', drop);
  bar.addEventListener('pointercancel', drop);
})();

// 연습 판: 마우스가 판 위 어디에 있는지 점으로 보여 주고, 마이크로비트 그림이 같이 기울고 떨린다.
(() => {
  const pad = $('sim-pad');
  const dot = $('pad-dot');
  const board = $('pad-board');
  const state = $('pad-state');
  const hint = $('pad-hint');
  let inside = false;
  let target = { x: 0, y: 0 }; // -1 ~ 1
  let shown = { x: 0, y: 0 };
  let shake = 0;
  let raf = 0;

  const setState = (text, kind) => {
    if (state.textContent !== text) state.textContent = text;
    state.dataset.kind = kind;
  };

  pad.addEventListener('pointermove', (e) => {
    const r = pad.getBoundingClientRect();
    target = { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 };
    if (!inside) {
      inside = true;
      pad.classList.add('inside');
    }
  });
  pad.addEventListener('pointerleave', () => {
    inside = false;
    target = { x: 0, y: 0 };
    pad.classList.remove('inside');
  });

  function frame() {
    raf = 0;
    if ($('sim-float').hidden) return; // 연습 판이 꺼지면 멈춘다
    const dx = target.x - shown.x;
    const dy = target.y - shown.y;
    shown.x += dx * 0.35;
    shown.y += dy * 0.35;
    // 움직인 속도만큼 흔들림이 커지고 천천히 가라앉는다
    shake = shake * 0.85 + Math.hypot(dx, dy) * 3;
    const s = Math.min(shake, 1.5);
    const w = pad.clientWidth;
    const h = pad.clientHeight;
    dot.style.transform = `translate(${(shown.x * 0.5 + 0.5) * w}px, ${(shown.y * 0.5 + 0.5) * h}px) scale(${1 + s * 0.6})`;
    dot.style.opacity = inside ? '1' : '0';
    const jx = (Math.random() - 0.5) * s * 10;
    const jy = (Math.random() - 0.5) * s * 10;
    board.style.transform = `translate(${jx}px, ${jy}px) rotateX(${-shown.y * 45}deg) rotateY(${shown.x * 45}deg)`;
    pad.classList.toggle('shaking', inside && s > 0.5);
    if (!inside) setState('판 밖이에요 · 센서는 가만히 있어요', 'out');
    else if (s > 0.5) setState('흔들고 있어요! 📳', 'shake');
    else if (Math.abs(shown.x) > 0.15 || Math.abs(shown.y) > 0.15) setState('기울이고 있어요 ↗', 'tilt');
    else setState('가만히 있어요', 'still');
    hint.hidden = inside;
    raf = requestAnimationFrame(frame);
  }
  // 연습 판이 보일 때 한 번 시작한다 (hidden이 풀리는 순간 감지)
  new MutationObserver(() => {
    if (!$('sim-float').hidden && !raf) raf = requestAnimationFrame(frame);
  }).observe($('sim-float'), { attributes: true, attributeFilter: ['hidden'] });
})();

function friendlyError(err) {
  if (err.name === 'NotFoundError') return null; // 창에서 선택하지 않고 닫음: 오류가 아니다
  if (err.name === 'NetworkError' && /GATT|Bluetooth/i.test(err.message)) {
    return '블루투스 연결에 실패했어요. 마이크로비트가 다른 기기(폰 등)와 연결돼 있지 않은지, 블루투스용 프로그램을 올렸는지 확인해 보세요.';
  }
  if (err.name === 'UnsupportedError') return '크롬이나 엣지 브라우저로 열어 주세요. (사파리, 아이패드는 안 돼요)';
  if (err.name === 'InvalidStateError' || err.name === 'NetworkError') {
    return '다른 곳에서 마이크로비트를 쓰고 있는 것 같아요. MakeCode 같은 다른 탭을 닫고 다시 해 보세요.';
  }
  return '연결하지 못했어요: ' + err.message;
}

conn.on('status', ({ state, kind, message }) => {
  clearTimeout(noDataTimer);
  if (state === 'connected') {
    setStatus(kind === 'simulator' ? '마우스로 해 보는 중' : kind === 'ble' ? '센서 켜짐 (블루투스)' : '센서 켜짐 (USB)', 'on');
    showMsg('');
    setConnectedUI(true, kind);
    if (kind === 'serial' || kind === 'ble') {
      noDataTimer = setTimeout(() => {
        showMsg('센서는 켰는데 움직임이 안 보여요. 마이크로비트에 프로그램을 올렸는지 아래 "처음이라면"을 확인해 보세요.', 'warn');
        $('setup').open = true;
      }, 3000);
    }
  } else if (state === 'error') {
    setStatus('센서가 꺼졌어요', 'err');
    showMsg('케이블이 빠졌는지 확인하고 다시 연결해 주세요. (' + (message || '') + ')', 'bad');
  } else if (state === 'disconnected') {
    if (!$('status').classList.contains('err')) setStatus('센서가 꺼져 있어요');
    setConnectedUI(false, kind);
    if (message) showMsg(message, 'warn');
  }
});
// 마이크로비트가 알려 준 버전(v1/v2)을 연결 상태 옆에 보여 준다
conn.on('info', ({ hw }) => {
  $('status').textContent = `${baseStatus} · micro:bit v${hw}`;
});
conn.on('sample', () => clearTimeout(noDataTimer));
conn.on('button', ({ name }) => showMsg(`마이크로비트의 ${name} 버튼을 눌렀어요!`));

async function start(connectFn) {
  try {
    await connectFn();
  } catch (err) {
    const text = friendlyError(err);
    if (text) {
      setStatus('센서를 못 켰어요', 'err');
      showMsg(text, 'bad');
    }
  }
}

$('btn-start').addEventListener('click', () => togglePick());
$('btn-connect').addEventListener('click', () => start(() => conn.useSerial()));
$('btn-ble').addEventListener('click', () => start(() => conn.useBle()));
$('btn-sim').addEventListener('click', () => start(() => conn.useSimulator($('sim-pad'))));
$('btn-disconnect').addEventListener('click', () => conn.disconnect());

// ---------- 화면 전환 (주소 끝의 #/모드이름) ----------
const view = $('view');
let unmount = null;
let routeToken = 0;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function renderHome() {
  document.title = '마이크로랩';
  const section = el('section', 'home');

  // 시작 순서: 센서 켜기 → 고르기
  const howto = el('ol', 'howto');
  for (const [n, text] of [['1', '위에서 센서를 켜요'], ['2', '하고 싶은 걸 골라요']]) {
    const li = el('li');
    li.append(el('b', '', n), text);
    howto.appendChild(li);
  }
  section.append(el('h2', 'home-title', '무엇을 해 볼까요?'), howto);

  for (const g of GROUPS) {
    const modes = MODES.filter((m) => m.group === g.id);
    if (!modes.length) continue;
    const box = el('section', 'group' + (g.id === 'soon' ? ' group-soon' : ''));
    const head = el('div', 'group-head');
    head.append(el('span', 'em', g.emoji), el('h3', '', g.title), el('small', '', g.sub));
    const grid = el('div', 'modes');
    for (const m of modes) {
      const card = el(m.load ? 'a' : 'div', 'mode-card' + (m.load ? '' : ' locked'));
      if (m.load) card.href = '#/' + m.id;
      card.append(el('span', 'em', m.emoji), el('b', '', m.title), el('small', '', m.load ? m.desc : '곧 만나요'));
      grid.appendChild(card);
    }
    box.append(head, grid);
    section.appendChild(box);
  }
  view.replaceChildren(section);
}

async function route() {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0]; // #/rules?level=block 처럼 뒤에 붙는 옵션은 모드가 읽는다
  const myToken = ++routeToken;
  unmount?.();
  unmount = null;

  const mode = MODES.find((m) => m.id === id && m.load);
  nav.setActive(mode ? mode.id : 'home');
  if (!mode) return renderHome();

  view.textContent = '불러오는 중...';
  try {
    const mod = await mode.load();
    if (myToken !== routeToken) return; // 그 사이 다른 화면으로 이동함
    view.replaceChildren();
    document.title = mode.title + ' · 마이크로랩';
    unmount = mod.mount(view, { conn });
  } catch (err) {
    if (myToken !== routeToken) return;
    view.textContent = '화면을 불러오지 못했어요: ' + err.message;
  }
}

window.addEventListener('hashchange', route);
route();
