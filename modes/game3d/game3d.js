import * as THREE from '../../vendor/three.module.min.js';
import { getRecognizer } from '../gesture/gesture.js';
import { createControl } from '../game/control.js';

// 3D 제스처 점프 게임: 2D 게임과 같은 조작(가르친 동작, 스페이스바, 화면 클릭)으로 길 위를 달리며 장애물을 넘는다.

const GRAVITY = 42; // 아래로 당기는 힘
const JUMP_V = 15.5; // 뛰어오르는 힘
const SPAWN_Z = -70; // 장애물이 나타나는 먼 곳
const BEST_KEY = 'microlab.game3d.best';

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
  const control = createControl({ gameId: 'game3d', onJump: () => jump() });
  let best = loadBest();

  // 게임 상태: 'ready' 시작 전, 'playing' 하는 중, 'over' 끝남
  let state = 'ready';
  let vy = 0;
  let distance = 0;
  let nextGap = 20;
  let overAt = 0;
  let raf = 0;
  let last = 0;
  let tick = 0;
  let obstacles = []; // [{ mesh, w, h }]

  const stage = h('div', { style: 'position:relative;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#cfe3ff' });
  const overlay = h('div', {
    style: 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:8%;gap:6px;pointer-events:none;color:#2c3560;font-weight:600;text-align:center',
  });
  const scoreEl = h('b', {}, '0');
  const bestEl = h('b', {}, String(best));
  const labelSel = h('select', { 'aria-label': '뛰게 할 동작', onchange: () => (jumpLabel = labelSel.value) });
  const msgEl = h('div', { class: 'msg', hidden: true, role: 'status' });

  root.replaceChildren(
    h('section', { class: 'card' },
      h('h2', {}, '🧊 3D 점프 게임'),
      h('ol', { class: 'howto' }, ...[['1', '뛰게 할 방법을 골라요'], ['2', '▶ 시작을 눌러요'], ['3', '장애물이 오면 그 동작을 해요 (스페이스바·화면 클릭도 돼요)']].map(([n, t]) => h('li', {}, h('b', {}, n), t))),
      control.chooser(
        h('div', { class: 'actions', style: 'margin:0' },
        h('label', {}, '뛸 동작: ', labelSel),
        h('button', { class: 'ghost', onclick: loadTaught }, '🔄 AI가 배운 동작 다시 불러오기'),
        ), msgEl),
      h('div', { class: 'actions' }, h('button', { onclick: start }, '▶ 시작')),
      stage,
      h('p', { class: 'rate' }, '점수 ', scoreEl, ' · 최고 점수 ', bestEl),
      control.compareEl),
  );

  function say(text, kind = '') {
    msgEl.hidden = !text;
    msgEl.textContent = text || '';
    msgEl.className = 'msg ' + kind;
  }

  function showOverlay(title, sub) {
    overlay.replaceChildren(
      ...[
        title ? h('div', { style: 'font-size:clamp(16px,3.4vw,24px)' }, title) : null,
        sub ? h('div', { style: 'font-size:clamp(12px,2.2vw,16px);font-weight:400' }, sub) : null,
      ].filter(Boolean),
    );
  }

  // ---------- 3D 장면 만들기 ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    say('이 컴퓨터에서는 3D 화면(WebGL)을 쓸 수 없어요. 2D 점프 게임을 이용해 주세요.', 'warn');
    return () => {};
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;cursor:pointer';
  renderer.domElement.setAttribute('aria-label', '게임 화면');
  stage.append(renderer.domElement, overlay);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe3ff);
  scene.fog = new THREE.Fog(0xcfe3ff, 25, 75);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 120);
  camera.position.set(0, 4.2, 8);
  camera.lookAt(0, 1.2, -8);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const disposables = [];
  const mat = (color) => {
    const m = new THREE.MeshLambertMaterial({ color });
    disposables.push(m);
    return m;
  };
  const geo = (g) => {
    disposables.push(g);
    return g;
  };

  // 바닥과 길
  const ground = new THREE.Mesh(geo(new THREE.PlaneGeometry(60, 200)), mat(0xbfe3a8));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -60;
  scene.add(ground);
  const road = new THREE.Mesh(geo(new THREE.PlaneGeometry(7, 200)), mat(0x8c93ad));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, -60);
  scene.add(road);

  // 달리는 느낌을 주는 길 위의 줄무늬 (뒤로 흘러가다 다시 앞으로 돌아온다)
  const STRIPE_GAP = 6;
  const stripeGeo = geo(new THREE.BoxGeometry(0.25, 0.02, 2));
  const stripeMat = mat(0xffffff);
  const stripes = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Mesh(stripeGeo, stripeMat);
    s.position.set(0, 0.03, 10 - i * STRIPE_GAP);
    scene.add(s);
    stripes.push(s);
  }

  // 캐릭터
  const player = new THREE.Group();
  const bodyMat = mat(0x5b6cf0);
  const body = new THREE.Mesh(geo(new THREE.BoxGeometry(1, 1, 1)), bodyMat);
  body.position.y = 1.2;
  const eyeW = new THREE.Mesh(geo(new THREE.BoxGeometry(0.28, 0.28, 0.1)), mat(0xffffff));
  eyeW.position.set(0.22, 1.45, -0.5);
  const eyeB = new THREE.Mesh(geo(new THREE.BoxGeometry(0.14, 0.14, 0.1)), mat(0x222222));
  eyeB.position.set(0.22, 1.45, -0.55);
  const legGeo = geo(new THREE.BoxGeometry(0.28, 0.5, 0.28));
  const legL = new THREE.Mesh(legGeo, bodyMat);
  const legR = new THREE.Mesh(legGeo, bodyMat);
  legL.position.set(-0.25, 0.5, 0);
  legR.position.set(0.25, 0.5, 0);
  player.add(body, eyeW, eyeB, legL, legR);
  scene.add(player);

  // 선인장 장애물
  const cactusMat = mat(0x3f9b4f);
  const trunkGeo = geo(new THREE.CylinderGeometry(0.4, 0.45, 1, 12));
  const armGeo = geo(new THREE.BoxGeometry(0.3, 0.3, 0.3));
  const armUpGeo = geo(new THREE.BoxGeometry(0.22, 0.5, 0.22));
  function makeCactus(height, width) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, cactusMat);
    trunk.scale.set(width, height, width);
    trunk.position.y = height / 2;
    g.add(trunk);
    const armY = height * 0.55;
    for (const side of [-1, 1]) {
      const a = new THREE.Mesh(armGeo, cactusMat);
      a.position.set(side * width * 0.55, armY, 0);
      const up = new THREE.Mesh(armUpGeo, cactusMat);
      up.position.set(side * width * 0.75, armY + 0.3, 0);
      g.add(a, up);
    }
    return g;
  }

  function resize() {
    const w = stage.clientWidth || 640;
    const hgt = stage.clientHeight || 360;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

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
    for (const o of obstacles) scene.remove(o.mesh);
    obstacles = [];
    vy = 0;
    distance = 0;
    nextGap = 22;
    player.position.y = 0;
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
    showOverlay('', '');
    led('clear');
  }

  function jump() {
    if (state === 'ready') return start();
    if (state === 'over') {
      if (performance.now() - overAt > 700) start(); // 끝나자마자 실수로 다시 시작하지 않게 잠깐 기다린다
      return;
    }
    if (player.position.y <= 0) {
      vy = JUMP_V;
      led('heart');
    }
  }

  function speed() {
    // 처음에는 느리게 시작해서 연습할 시간을 주고, 점점 빨라진다
    return 9 + Math.min(10, distance * 0.012);
  }

  function update(dt) {
    tick += dt;
    const v = speed();
    distance += v * dt;

    vy -= GRAVITY * dt;
    player.position.y = Math.max(0, player.position.y + vy * dt);
    if (player.position.y <= 0) vy = 0;

    for (const o of obstacles) o.mesh.position.z += v * dt;
    for (const o of obstacles) {
      if (o.mesh.position.z > 12) scene.remove(o.mesh);
    }
    obstacles = obstacles.filter((o) => o.mesh.position.z <= 12);

    nextGap -= v * dt;
    if (nextGap <= 0) {
      const height = 1.1 + Math.random() * 0.7;
      const width = 1 + Math.random() * 0.4;
      const mesh = makeCactus(height, width);
      mesh.position.set(0, 0, SPAWN_Z);
      scene.add(mesh);
      obstacles.push({ mesh, w: width * 0.8, h: height });
      nextGap = 17 + Math.random() * 12; // 뛰어서 넘을 수 있는 간격만 둔다
    }

    // 부딪혔는지 본다 (몸보다 조금 작게 잡아서 너무 억울하지 않게)
    const py = player.position.y;
    for (const o of obstacles) {
      const overlapZ = Math.abs(o.mesh.position.z) < 0.5 + o.w / 2 - 0.15;
      if (overlapZ && py < o.h - 0.2) return gameOver();
    }
    scoreEl.textContent = String(Math.floor(distance));
  }

  function gameOver() {
    state = 'over';
    overAt = performance.now();
    const score = Math.floor(distance);
    scoreEl.textContent = String(score);
    control.record(score);
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      saveBest(best);
    }
    bodyMat.color.set(0xe06c6c);
    showOverlay(`게임 끝! 점수 ${score}`, '뛰기 동작이나 스페이스바로 다시 시작해요');
    led('sad');
  }

  // ---------- 그리기 ----------
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // 탭을 오래 떠났다 와도 한꺼번에 튀지 않게 한다
    last = now;
    if (state === 'playing') {
      update(dt);
      // 줄무늬는 장애물과 같은 속도로 흘러야 달리는 느낌이 맞는다
      for (const s of stripes) {
        s.position.z += speed() * dt;
        if (s.position.z > 12) s.position.z -= stripes.length * STRIPE_GAP;
      }
    }
    drawScene();
    raf = requestAnimationFrame(loop);
  }

  function drawScene() {
    if (state === 'playing') {
      const run = player.position.y <= 0;
      const swing = run ? Math.sin(tick * 16) * 0.12 : 0;
      legL.position.y = 0.5 + swing;
      legR.position.y = 0.5 - swing;
      bodyMat.color.set(0x5b6cf0);
    }
    // 점프할 때 카메라가 살짝 같이 올라가서 높이가 느껴지게 한다
    camera.position.y = 4.2 + player.position.y * 0.25;
    renderer.render(scene, camera);
  }

  // ---------- 입력 ----------
  function onKey(e) {
    if (e.code !== 'Space' && e.code !== 'ArrowUp') return;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
    e.preventDefault();
    jump();
  }

  reset();
  showOverlay('시작 버튼이나 스페이스바를 눌러요!', '');
  loadTaught();
  control.start();
  const offs = [conn.on('sample', (s) => {
    if (control.mode === 'ai') recognizer?.push(s.x, s.y, s.z);
    else control.push(s);
  })];
  renderer.domElement.addEventListener('pointerdown', jump);
  document.addEventListener('keydown', onKey);
  raf = requestAnimationFrame((t) => {
    last = t;
    loop(t);
  });

  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', resize);
    offs.forEach((off) => off?.());
    control.stop();
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
  };
}
