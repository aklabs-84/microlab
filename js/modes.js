// 앱에 들어가는 모드 목록. 새 모드는 여기에 한 줄만 추가하면 홈 화면에 카드가 생긴다.
// group: 홈에서 어느 묶음에 보일지 (GROUPS의 id)
// desc: 학생이 한눈에 알 수 있는 짧은 한 줄 (15자 안팎)
// load: 모드 파일을 불러오는 함수 (null이면 "곧 만들어요" 카드)
// 모드 파일은 mount(root, { conn })을 내보내고, 정리용 함수를 돌려준다.
export const GROUPS = [
  { id: 'look', emoji: '🔭', title: '살펴보기', sub: '센서가 어떻게 움직이는지 봐요' },
  { id: 'teach', emoji: '🧠', title: 'AI 가르치기', sub: '내 동작을 AI에게 알려 줘요' },
  { id: 'make', emoji: '🛠️', title: '내가 만들기', sub: '내 생각대로 규칙을 만들어요' },
  { id: 'soon', emoji: '⏳', title: '곧 만나요', sub: '준비 중이에요' },
];

export const MODES = [
  {
    id: 'dashboard',
    group: 'look',
    emoji: '📈',
    title: '센서 그래프',
    desc: '움직임을 그래프로 봐요',
    load: () => import('../modes/dashboard/dashboard.js'),
  },
  {
    id: 'gesture',
    group: 'teach',
    emoji: '🖐️',
    title: '동작 맞히기 AI',
    desc: '동작을 가르치면 AI가 맞혀요',
    load: () => import('../modes/gesture/gesture.js'),
  },
  {
    id: 'game',
    group: 'teach',
    emoji: '🏃',
    title: '점프 게임',
    desc: '내 동작으로 캐릭터를 뛰게 해요',
    load: () => import('../modes/game/game.js'),
  },
  {
    id: 'game3d',
    group: 'teach',
    emoji: '🧊',
    title: '3D 점프 게임',
    desc: '3D 길에서 장애물을 넘어요',
    load: () => import('../modes/game3d/game3d.js'),
  },
  {
    id: 'rules',
    group: 'make',
    emoji: '🧪',
    title: '내가 만드는 규칙',
    desc: '"이럴 때 → 이렇게" 규칙을 짜요',
    load: () => import('../modes/rules/rules.js'),
  },
  {
    id: 'robot',
    group: 'soon',
    emoji: '🤖',
    title: 'AI로 로봇 조종',
    desc: '내가 만든 AI로 로봇을 움직여요',
    load: null,
  },
  {
    id: 'coding',
    group: 'soon',
    emoji: '💬',
    title: '말로 시키는 코딩',
    desc: '말로 하면 AI가 도와줘요',
    load: null,
  },
];
