// "쓸 수 있는 값" 도움말: 뜻 → 예시 → [코드창에 넣기] 순서로 보여 준다.
// 예시는 완성 정답이 아니라 한 줄짜리 조각이다. 숫자와 그림은 학생이 바꿔 보게 한다.

// 예시: [코드, 풀이, 넣는 방법('cursor' = 커서 자리, 'end' = 맨 아래, null = 버튼 없음)]
const GROUPS = [
  {
    title: '📡 센서값 — 마이크로비트가 알려 주는 숫자',
    open: true,
    intro: '이 숫자들은 읽기만 할 수 있어요. 센서값이 올 때마다(1초에 약 50번) 새 숫자로 바뀌어요. 마이크로비트를 이리저리 기울여 보면서, 위쪽 그래프에서 어느 색 선이 움직이는지 직접 확인해 보세요.',
    terms: [
      ['x', '왼쪽·오른쪽 기울기', '그래프의 빨간 선'],
      ['y', '앞·뒤 기울기', '그래프의 초록 선'],
      ['z', '위·아래 방향', '그래프의 파란 선'],
      ['세기', '전체 힘. 가만히 놓으면 약 1024', '그래프의 진한 회색 선'],
      ['흔들림', '얼마나 흔들었나. 가만히 있으면 0', '숫자가 클수록 많이 흔든 거예요'],
    ],
    examples: [
      ['if (x > 300) {\n  하트()\n}', 'x가 300보다 크면 하트. 기울여 보며 숫자를 바꿔 봐요.', 'cursor'],
      ['if (흔들림 > 300) {\n  웃음()\n}', '흔들면 웃음', 'cursor'],
      ['말하기("세기는 " + 세기)', '센서값을 글자와 이어 붙여 말해요. (오른쪽 말풍선에 나와요)', 'cursor'],
    ],
  },
  {
    title: '🔀 조건 — "만약 이러면" 쓰는 법',
    intro: '"만약 ~이면 ~해라"는 if로 써요. 괄호 ( ) 안이 조건이고, 중괄호 { } 안이 해야 할 일이에요.',
    terms: [
      ['>', '~보다 커요', '예: x > 300'],
      ['<', '~보다 작아요', '예: x < -300 (마이너스도 쓸 수 있어요)'],
      ['==', '똑같아요 (= 가 두 개!)', '예: 흔들림 == 0'],
      ['&&', '그리고 — 둘 다 맞아야 해요', '예: x > 300 && y > 300'],
      ['||', '또는 — 하나만 맞아도 돼요', '예: x > 300 || x < -300'],
      ['else', '아니면', 'if가 아닐 때 할 일을 써요'],
    ],
    examples: [
      ['if (흔들림 > 300) {\n  하트()\n} else {\n  끄기()\n}', '흔들면 하트, 아니면 끄기', 'cursor'],
      ['if (x > 300 && y > 300) {\n  예()\n}', '"그리고": 둘 다 맞을 때만', 'cursor'],
      ['if (x > 300 || x < -300) {\n  웃음()\n}', '"또는": 한쪽만 맞아도', 'cursor'],
    ],
  },
  {
    title: '💡 LED 그림 — 마이크로비트에 보여 줄 그림',
    intro: '아래 이름을 코드에 쓰면 그림이 나와요. 이름 뒤에 ( ) 를 꼭 붙여요. 가짜 LED와 진짜 마이크로비트가 같이 반응해요.',
    leds: [
      ['하트()', 'heart'],
      ['웃음()', 'happy'],
      ['울음()', 'sad'],
      ['예()', 'yes'],
      ['아니오()', 'no'],
      ['끄기()', 'clear'],
    ],
    examples: [['하트()', '한 줄만 써도 그림이 나와요', 'cursor']],
  },
  {
    title: '🕐 언제 실행돼요? — 함수 이름의 비밀',
    intro: '아래 이름으로 만든 function은 때가 되면 저절로 실행돼요. 직접 부르지 않아도 돼요.',
    terms: [
      ['반복()', '센서값이 올 때마다 계속', '가장 많이 쓰는 함수예요. 이미 코드창에 있어요.'],
      ['버튼A눌림()', 'A 버튼을 누를 때만', '버튼B눌림()도 있어요.'],
      ['말하기("글")', '말풍선에 글 남기기', '큰따옴표 " " 로 감싸요.'],
      ['점프()', '점프 신호 보내기', '점프 게임과 이어질 때 써요.'],
    ],
    examples: [
      ['function 버튼A눌림() {\n  하트()\n}', 'A 버튼을 누르면 하트 (코드 맨 아래에 따로 넣어요)', 'end'],
      ['말하기("안녕!")', '말풍선에 "안녕!"', 'cursor'],
    ],
  },
];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// icons: { 이름: ['01010', ...] } (5x5)
export function mountHelp(container, { insert, icons }) {
  for (const g of GROUPS) {
    const box = el('details', 'help-group');
    box.open = !!g.open;
    box.append(el('summary', '', g.title));
    box.append(el('p', 'help-intro', g.intro));

    if (g.terms) {
      const table = el('div', 'help-terms');
      for (const [name, mean, note] of g.terms) {
        table.append(el('code', '', name), el('span', 'mean', mean), el('span', 'note', note));
      }
      box.append(table);
    }

    if (g.leds) {
      const row = el('div', 'help-leds');
      for (const [name, key] of g.leds) {
        const cell = el('div', 'help-led');
        const grid = el('div', 'led-mini');
        grid.setAttribute('role', 'img');
        grid.setAttribute('aria-label', name + ' 그림');
        for (const r of icons[key]) for (const c of r) grid.append(el('i', c === '1' ? 'on' : ''));
        cell.append(grid, el('code', '', name));
        row.append(cell);
      }
      box.append(row);
    }

    box.append(el('div', 'help-eg-title', '예시'));
    for (const [code, note, where] of g.examples) {
      const eg = el('div', 'help-eg');
      const pre = el('pre', '', code);
      const side = el('div', 'help-eg-side');
      side.append(el('span', '', note));
      if (where) {
        const b = el('button', 'ghost', '코드창에 넣기');
        b.type = 'button';
        b.addEventListener('click', () => insert(code, where));
        side.append(b);
      }
      eg.append(pre, side);
      box.append(eg);
    }
    container.append(box);
  }
}
