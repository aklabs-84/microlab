import { getRecognizer } from '../gesture/gesture.js';
import { createControl } from '../game/control.js';

// 제스처 점프 게임: 제스처 모드에서 가르친 동작으로 캐릭터를 뛰게 한다. (스페이스바, 화면 클릭도 된다)

const W = 720;
const H = 240;
const GROUND = 190; // 땅의 높이(y)
const GRAVITY = 1800; // 아래로 당기는 힘
const JUMP_V = 640; // 뛰어오르는 힘
const BEST_KEY = 'microlab.game.best';

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

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n) {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    // 저장이 막힌 브라우저에서는 이번 판만 기억한다
  }
}

export function mount(root, { conn }) {
  let recognizer = null;
  let jumpLabel = null;
  const control = createControl({ gameId: 'game', onJump: () => jump() });
  let best = loadBest();

  // 게임 상태: 'ready' 시작 전, 'playing' 하는 중, 'over' 끝남
  let state = 'ready';
  let player; // { y, vy }
  let obstacles; // [{ x, w, h }]
  let distance; // 달린 거리(px)
  let nextGap;
  let overAt = 0;
  let raf = 0;
  let last = 0;
  let tick = 0; // 달리기 모양 바꾸기용

  const canvas = h('canvas', { width: W, height: H, style: 'height:auto;aspect-ratio:3/1;cursor:pointer', 'aria-label': '게임 화면' });
  const ctx = canvas.getContext('2d');
  const scoreEl = h('b', {}, '0');
  const bestEl = h('b', {}, String(best));
  const labelSel = h('select', { 'aria-label': '뛰게 할 동작', onchange: () => (jumpLabel = labelSel.value) });
  const msgEl = h('div', { class: 'msg', hidden: true, role: 'status' });

  root.replaceChildren(
    h('section', { class: 'card' },
      h('h2', {}, '🏃 점프 게임'),
      h('ol', { class: 'howto' }, ...[['1', '뛰게 할 방법을 골라요'], ['2', '▶ 시작을 눌러요'], ['3', '장애물이 오면 그 동작을 해요 (스페이스바·화면 클릭도 돼요)']].map(([n, t]) => h('li', {}, h('b', {}, n), t))),
      control.chooser(
        h('div', { class: 'actions', style: 'margin:0' },
        h('label', {}, '뛸 동작: ', labelSel),
        h('button', { class: 'ghost', onclick: loadTaught }, '🔄 AI가 배운 동작 다시 불러오기'),
        ), msgEl),
      h('div', { class: 'actions' }, h('button', { onclick: start }, '▶ 시작')),
      canvas,
      h('p', { class: 'rate' }, '점수 ', scoreEl, ' · 최고 점수 ', bestEl),
      control.compareEl),
  );

  function say(text, kind = '') {
    msgEl.hidden = !text;
    msgEl.textContent = text || '';
    msgEl.className = 'msg ' + kind;
  }

  // ---------- 가르친 동작 불러오기 ----------
  function loadTaught() {
    recognizer = getRecognizer(onGesture);
    labelSel.replaceChildren();
    if (!recognizer) {
      say('가르친 동작이 아직 없어요. 스페이스바로는 지금도 할 수 있어요. 동작으로 하려면 "동작 맞히기 AI"에서 동작을 2가지 이상 기록하고 가르쳐 주세요.', 'warn');
      jumpLabel = null;
      return;
    }
    for (const name of recognizer.labels) labelSel.append(h('option', { value: name }, name));
    // "뛰기/점프/위" 같은 이름이 있으면 그걸 먼저 고른다
    const guess = recognizer.labels.find((n) => /뛰|점프|위|jump/i.test(n)) ?? recognizer.labels[0];
    labelSel.value = guess;
    jumpLabel = guess;
    say('');
  }

  function onGesture(label) {
    if (label === jumpLabel) jump();
  }

  // ---------- 게임 규칙 ----------
  function reset() {
    player = { y: GROUND, vy: 0 };
    obstacles = [];
    distance = 0;
    nextGap = 500;
    scoreEl.textContent = '0';
  }

  function led(icon) {
    if (conn.connected) conn.send('icon:' + icon).catch(() => {});
  }

  function start() {
    reset();
    state = 'playing';
    last = performance.now();
    recognizer?.reset();
    led('clear');
  }

  function jump() {
    if (state === 'ready') return start();
    if (state === 'over') {
      if (performance.now() - overAt > 700) start(); // 끝나자마자 실수로 다시 시작하지 않게 잠깐 기다린다
      return;
    }
    if (player.y >= GROUND) {
      player.vy = -JUMP_V;
      led('heart');
    }
  }

  function speed() {
    // 처음에는 느리게 시작해서 연습할 시간을 주고, 점점 빨라진다
    return 200 + Math.min(300, distance * 0.012);
  }

  function update(dt) {
    tick += dt;
    distance += speed() * dt;
    player.vy += GRAVITY * dt;
    player.y = Math.min(GROUND, player.y + player.vy * dt);
    if (player.y >= GROUND) player.vy = 0;

    for (const o of obstacles) o.x -= speed() * dt;
    obstacles = obstacles.filter((o) => o.x + o.w > -10);

    nextGap -= speed() * dt;
    if (nextGap <= 0) {
      obstacles.push({ x: W + 20, w: 24 + Math.random() * 12, h: 32 + Math.random() * 18 });
      nextGap = 420 + Math.random() * 300; // 뛰어서 넘을 수 있는 간격만 둔다
    }

    // 부딪혔는지 본다 (캐릭터 몸보다 조금 작게 잡아서 너무 억울하지 않게)
    const px = 60 + 6;
    const pw = 28;
    const ptop = player.y - 34;
    for (const o of obstacles) {
      if (px + pw > o.x + 4 && px < o.x + o.w - 4 && player.y > GROUND - o.h + 6 && ptop < GROUND) {
        return gameOver();
      }
    }
    scoreEl.textContent = String(Math.floor(distance / 10));
  }

  function gameOver() {
    state = 'over';
    overAt = performance.now();
    const score = Math.floor(distance / 10);
    scoreEl.textContent = String(score);
    control.record(score);
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      saveBest(best);
    }
    led('sad');
  }

  // ---------- 그리기 ----------
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#eef3ff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c9d4f2';
    ctx.fillRect(0, GROUND, W, 3);

    if (state !== 'ready') {
      ctx.font = '40px system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      for (const o of obstacles) {
        ctx.save();
        ctx.translate(o.x + o.w / 2, GROUND + 2);
        ctx.scale(o.w / 28, o.h / 36);
        ctx.textAlign = 'center';
        ctx.fillText('🌵', 0, 0);
        ctx.restore();
      }
    }
    drawPlayer(player ?? { y: GROUND });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a5578';
    ctx.font = '600 20px system-ui, sans-serif';
    if (state === 'ready') ctx.fillText('시작 버튼이나 스페이스바를 눌러요!', W / 2, 70);
    if (state === 'over') {
      ctx.fillText(`게임 끝! 점수 ${Math.floor(distance / 10)}`, W / 2, 60);
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('뛰기 동작이나 스페이스바로 다시 시작해요', W / 2, 88);
    }
  }

  function drawPlayer(p) {
    const x = 60;
    const y = p.y - 34;
    ctx.fillStyle = state === 'over' ? '#e06c6c' : '#5b6cf0';
    ctx.beginPath();
    ctx.roundRect(x + 4, y, 32, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 24, y + 7, 8, 8); // 눈
    ctx.fillStyle = '#222';
    ctx.fillRect(x + 28, y + 9, 4, 4);
    ctx.fillStyle = state === 'over' ? '#e06c6c' : '#5b6cf0';
    const step = p.y >= GROUND && state === 'playing' && Math.floor(tick * 10) % 2 === 0;
    ctx.fillRect(x + 8, y + 30, 8, step ? 4 : 2); // 다리
    ctx.fillRect(x + 24, y + 30, 8, step ? 2 : 4);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // 탭을 오래 떠났다 와도 한꺼번에 튀지 않게 한다
    last = now;
    if (state === 'playing') update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  // ---------- 입력 ----------
  function onKey(e) {
    if (e.code !== 'Space' && e.code !== 'ArrowUp') return;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
    e.preventDefault();
    jump();
  }

  reset();
  loadTaught();
  control.start();
  const offs = [conn.on('sample', (s) => {
    if (control.mode === 'ai') recognizer?.push(s.x, s.y, s.z);
    else control.push(s);
  })];
  canvas.addEventListener('pointerdown', jump);
  document.addEventListener('keydown', onKey);
  raf = requestAnimationFrame((t) => {
    last = t;
    loop(t);
  });

  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    offs.forEach((off) => off?.());
    control.stop();
  };
}
