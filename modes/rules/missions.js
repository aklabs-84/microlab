// 미션 카드 데이터. 정답(해결 코드)은 일부러 넣지 않는다.
// 선생님이 미션을 더하거나 고치려면 아래 목록만 바꾸면 된다.
// questions: 학생이 스스로 생각해 볼 질문 (2~3개)
export const MISSIONS = [
  {
    id: 'shake-heart',
    emoji: '🫨',
    title: '흔들면 하트',
    desc: '마이크로비트를 흔들면 하트가 나타나게 해 보세요.',
    questions: [
      '가만히 있을 때와 흔들 때, 그래프의 어떤 선이 어떻게 달라지나요?',
      '기준 숫자를 너무 작게 하면 어떤 일이 생길까요?',
      '흔들기를 멈추면 하트는 어떻게 되면 좋을까요?',
    ],
  },
  {
    id: 'double-tap',
    emoji: '👆',
    title: '책상을 두 번 두드리면 켜지기',
    desc: '한 번이 아니라 두 번 두드렸을 때만 반응하게 해 보세요.',
    questions: [
      '한 번 두드릴 때 그래프는 어떤 모양일까요?',
      '"두 번"이라는 걸 컴퓨터는 어떻게 알 수 있을까요? 무엇을 기억해 두어야 할까요?',
      '두 번 사이의 시간이 너무 길면 어떻게 할까요?',
    ],
  },
  {
    id: 'tilt-arrow',
    emoji: '↔️',
    title: '기울이는 쪽을 알려 주기',
    desc: '왼쪽으로 기울이면 하나, 오른쪽으로 기울이면 다른 그림이 나오게 해 보세요.',
    questions: [
      '왼쪽, 오른쪽으로 기울일 때 x, y, z 중 어떤 값이 바뀌나요?',
      '똑바로 놓았을 때는 어떤 그림이 좋을까요?',
      '조금만 기울였을 때도 반응하게 할까요, 많이 기울였을 때만 할까요?',
    ],
  },
  {
    id: 'sleepy',
    emoji: '😴',
    title: '가만히 있으면 졸린 얼굴',
    desc: '한참 움직이지 않으면 졸린 얼굴이 나오게 해 보세요.',
    questions: [
      '"가만히 있다"는 그래프에서 어떻게 보이나요?',
      '아주 잠깐 가만히 있는 것과 오래 가만히 있는 것을 어떻게 구분할까요?',
      '다시 움직이면 어떤 얼굴이 좋을까요?',
    ],
  },
  {
    id: 'free',
    emoji: '💡',
    title: '내가 정하는 미션',
    desc: '내가 만들고 싶은 규칙을 스스로 정해 보세요.',
    questions: [
      '어떤 상황에서 마이크로비트가 어떻게 반응하면 재미있을까요?',
      '그 상황에서 센서값은 어떻게 변할까요? 먼저 그래프로 확인해 봐요.',
      '내 규칙이 잘 되는지 어떻게 확인할 수 있을까요?',
    ],
  },
];

const KEY = 'microlab.rules.mission';

// container 안에 미션 고르기 화면을 그린다. 고른 미션은 get()으로 알 수 있다.
export function mountMissions(container, { onChange } = {}) {
  let current = null;
  try {
    current = MISSIONS.find((m) => m.id === localStorage.getItem(KEY)) ?? null;
  } catch {
    // 저장이 막힌 브라우저에서는 이번에만 기억한다
  }

  container.innerHTML = `
    <div class="mission-chips" role="group" aria-label="미션 고르기"></div>
    <div class="mission-detail" aria-live="polite"></div>`;
  const chips = container.querySelector('.mission-chips');
  const detail = container.querySelector('.mission-detail');

  for (const m of MISSIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ghost';
    b.dataset.id = m.id;
    b.textContent = `${m.emoji} ${m.title}`;
    b.addEventListener('click', () => select(m));
    chips.append(b);
  }

  function select(m) {
    current = m;
    try {
      localStorage.setItem(KEY, m.id);
    } catch {
      // 저장 실패는 무시
    }
    render();
    onChange?.(m);
  }

  function render() {
    chips.querySelectorAll('button').forEach((b) => b.classList.toggle('picked', b.dataset.id === current?.id));
    if (!current) {
      detail.textContent = '';
      return;
    }
    const ul = document.createElement('ul');
    for (const q of current.questions) {
      const li = document.createElement('li');
      li.textContent = q;
      ul.append(li);
    }
    const p = document.createElement('p');
    p.innerHTML = '<b></b> ';
    p.firstChild.textContent = current.title + ':';
    p.append(current.desc);
    const h = document.createElement('div');
    h.className = 'small';
    h.textContent = '생각해 볼 질문';
    detail.replaceChildren(p, h, ul);
  }
  render();

  return { get: () => current };
}
