// 학생이 쓴 규칙(글 코드)을 따로 떨어진 일꾼(Worker)에서 실행한다.
// 여기서 무한 반복이 돼도 화면은 멈추지 않는다. (앱이 이 일꾼을 멈춰 준다)
//
// 학생 코드에서 쓸 수 있는 말
//   값: x, y, z (기울기), 세기 (전체 힘, 가만히 있으면 약 1024), 흔들림 (가만히 있으면 0)
//   LED: 하트() 웃음() 울음() 예() 아니오() 끄기()
//   그 밖: 말하기("글"), 점프()
//   함수: 반복() 센서값이 올 때마다, 버튼A눌림() 버튼B눌림() 버튼을 누를 때마다
const post = self.postMessage.bind(self);

// 학생 코드가 인터넷으로 무언가 보내지 못하게 막는다.
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'indexedDB', 'importScripts']) {
  try {
    self[name] = undefined;
  } catch {
    // 막을 수 없는 것은 그대로 둔다
  }
}

const ICONS = { 하트: 'heart', 웃음: 'happy', 울음: 'sad', 예: 'yes', 아니오: 'no', 끄기: 'clear' };
for (const [korean, icon] of Object.entries(ICONS)) {
  self[korean] = () => post({ type: 'action', name: 'icon', arg: icon });
}
self.말하기 = (text) => post({ type: 'action', name: 'say', arg: String(text).slice(0, 80) });
self.점프 = () => post({ type: 'action', name: 'jump' });

// 어려운 영어 오류를 쉬운 한국어로 바꾼다. (정답은 알려 주지 않고, 어디를 볼지만 알려 준다)
function friendly(err) {
  const msg = String((err && err.message) || err);
  let m;
  if (err instanceof SyntaxError) return '글이 어딘가 이상해요. 괄호 ( ) { } 나 따옴표가 짝이 맞는지 봐요.';
  if ((m = /^(.+) is not defined$/.exec(msg))) return `'${m[1]}'이(가) 뭔지 몰라요. 이름을 잘못 썼거나, 먼저 만들지 않았을 수 있어요.`;
  if ((m = /^(.+) is not a function$/.exec(msg))) return `'${m[1]}'은(는) 함수가 아니에요. 이름이나 괄호 ( )를 확인해요.`;
  if (/Assignment to constant/.test(msg)) return 'const로 만든 값은 바꿀 수 없어요. let으로 만들어 보세요.';
  if (/before initialization/.test(msg)) return '값을 만들기 전에 먼저 쓰고 있어요. 변수를 더 위쪽에서 먼저 만들어요.';
  return msg;
}

// 오류가 난 줄 번호 (알 수 있을 때만)
function lineOf(err) {
  const m = /<anonymous>:(\d+):\d+/.exec(String((err && err.stack) || ''));
  return m ? Number(m[1]) : null;
}

let hooks = { loop: null, buttonA: null, buttonB: null };

self.onmessage = (e) => {
  const d = e.data;
  try {
    if (d.type === 'run') {
      // 학생 코드를 한 번 실행하고, 끝에 붙인 한 줄로 반복()과 버튼 함수를 찾아 둔다.
      // (함수 선언이든 화살표 함수든 같은 곳에서 찾을 수 있고, 줄 번호도 그대로 맞는다)
      (0, eval)(
        d.code +
          '\n;self.__hooks = { loop: typeof 반복 === "function" ? 반복 : null,' +
          ' buttonA: typeof 버튼A눌림 === "function" ? 버튼A눌림 : null,' +
          ' buttonB: typeof 버튼B눌림 === "function" ? 버튼B눌림 : null };',
      );
      hooks = self.__hooks;
      post({ type: 'ready', hasLoop: !!hooks.loop, hasButton: !!(hooks.buttonA || hooks.buttonB) });
    } else if (d.type === 'tick') {
      self.x = d.x;
      self.y = d.y;
      self.z = d.z;
      self.세기 = Math.round(Math.hypot(d.x, d.y, d.z));
      self.흔들림 = Math.abs(self.세기 - 1024);
      if (hooks.loop) hooks.loop();
      post({ type: 'done' });
    } else if (d.type === 'button') {
      const fn = d.name === 'A' ? hooks.buttonA : hooks.buttonB;
      if (fn) fn();
      post({ type: 'done' });
    }
  } catch (err) {
    post({ type: 'error', message: friendly(err), line: lineOf(err) });
  }
};
