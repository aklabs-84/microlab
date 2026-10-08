// 시도 기록: ▶ 실행할 때마다 코드 버전을 저장하고, 시도마다 한 줄 메모(생각/결과/고칠 점)를 남긴다.
// 기록은 이 브라우저(localStorage)에만 저장된다.
const KEY = 'microlab.rules.notes';
const DRAFT_KEY = 'microlab.rules.draft'; // 실행하기 전에 쓴 '내 예상'
const MAX_VERSIONS = 20;
// [키, 이름, 안내 질문, 예시]
const FIELDS = [
  ['think', '① 실행하기 전에 쓴 내 예상', '(① 생각하기 탭에서 적어요. 여기서도 고칠 수 있어요)', '예) 흔들면 하트가 나올 것 같아요'],
  ['result', '② 실행한 뒤: 실제 결과', '진짜로는 어떻게 됐어요?', '예) 살짝만 움직여도 하트가 나왔어요'],
  ['fix', '③ 다음에 바꿀 점', '다음엔 무엇을 바꿔 볼래요?', '예) 기준 숫자 300을 600으로 올려 볼래요'],
];

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}
function timeText(t) {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// 목록에서 시도를 구분하기 위한 한 줄: 메모를 썼으면 그 글, 아니면 코드의 if 줄
function summary(v) {
  const memo = (v.think || v.result || v.fix || '').trim();
  if (memo) return '📝 ' + memo.slice(0, 28);
  const lines = v.code.split('\n').map((l) => l.trim());
  const line = lines.find((l) => /^(if|else|let|말하기|하트|웃음|울음|예|아니오|끄기|점프)/.test(l)) ?? lines.find((l) => l && !l.startsWith('//')) ?? '(빈 코드)';
  return line.slice(0, 28);
}

// api: { setCode(code), getMissionTitle() }
export function mountNotes(container, { setCode, getMissionTitle }) {
  let versions = load();
  let selected = versions.length ? versions[versions.length - 1].n : null;
  let saveTimer = 0;

  // 실행 전 예상(draft): ▶ 실행할 때 그 시도에 붙는다. 고칠 점을 쓰면 다음 예상 칸에 미리 채워진다.
  let draft = '';
  let autoFilled = '';
  const draftListeners = new Set();
  try {
    draft = localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    draft = '';
  }
  function setDraft(text, fromAuto = false) {
    draft = text;
    if (fromAuto) autoFilled = text;
    try {
      localStorage.setItem(DRAFT_KEY, draft);
    } catch {
      // 저장이 막힌 브라우저에서는 이번에만 기억한다
    }
    draftListeners.forEach((fn) => fn(draft));
  }

  container.innerHTML = `
    <div class="note-intro">
      <p><b>과학 실험 노트</b>처럼 써 봐요. ▶ 실행을 누를 때마다 규칙을 한 번 <b>시험해 본 것(1번 시도)</b>이 되고, 아래 메모는 그 시도에 대해 쓰는 거예요.</p>
      <p class="small"><b>내 예상</b>은 실행하기 전에 <u>① 생각하기</u> 탭에서 적어요. 여기서는 예상과 <b>실제 결과</b>를 나란히 놓고 비교해 봐요. 안 써도 규칙은 잘 돌아가요.</p>
    </div>
    <div class="note-form" data-form>
      <div class="note-for" data-for></div>
    </div>
    <ul class="versions" data-list aria-label="시도 목록"></ul>
    <div class="actions" style="margin-top:8px">
      <button class="ghost" data-copy>📋 기록 복사하기</button>
      <button class="ghost" data-clear>🗑 기록 지우기</button>
    </div>
    <div class="small" data-status aria-live="polite"></div>`;
  const form = container.querySelector('[data-form]');
  const forEl = container.querySelector('[data-for]');
  const codeView = document.createElement('pre');
  codeView.className = 'note-code';
  const list = container.querySelector('[data-list]');
  const status = container.querySelector('[data-status]');

  const inputs = {};
  for (const [key, label, hint, example] of FIELDS) {
    const wrap = document.createElement('label');
    wrap.className = 'note-field';
    const span = document.createElement('span');
    span.textContent = label;
    const q = document.createElement('small');
    q.textContent = ' ' + hint;
    span.append(q);
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 80;
    input.placeholder = example;
    input.title = hint;
    input.addEventListener('input', () => {
      const v = current();
      if (!v) return;
      v[key] = input.value;
      if (key === 'fix' && v.n === versions[versions.length - 1]?.n && (draft === '' || draft === autoFilled)) {
        setDraft(input.value, true);
      }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 400);
    });
    input.addEventListener('change', render);
    wrap.append(span, input);
    form.append(wrap);
    inputs[key] = input;
  }

  const codeBox = document.createElement('details');
  codeBox.className = 'note-codebox';
  const codeSum = document.createElement('summary');
  codeSum.textContent = '이 시도의 코드 보기';
  codeBox.append(codeSum, codeView);
  form.append(codeBox);

  const current = () => versions.find((v) => v.n === selected) ?? null;

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(versions));
    } catch {
      // 저장이 막힌 브라우저에서는 이번에만 기억한다
    }
  }

  function say(text) {
    status.textContent = text;
  }

  function render() {
    list.replaceChildren();
    const v = current();
    form.hidden = !v;
    if (v) {
      for (const [key] of FIELDS) inputs[key].value = v[key] ?? '';
      forEl.textContent = `✏️ 지금 쓰는 메모는 ${v.n}번 시도(${timeText(v.t)})의 코드에 대한 거예요`;
      codeView.textContent = v.code.trim();
    }
    if (!versions.length) {
      const li = document.createElement('li');
      li.className = 'small';
      li.textContent = '아직 기록이 없어요. ▶ 실행을 누르면 첫 시도가 저장돼요.';
      list.append(li);
      return;
    }
    for (const item of [...versions].reverse()) {
      const li = document.createElement('li');
      li.className = item.n === selected ? 'picked' : '';
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'ghost';
      pick.textContent = `${item.n}번 시도 · ${timeText(item.t)} · ${summary(item)}`;
      pick.addEventListener('click', () => {
        selected = item.n;
        render();
      });
      li.append(pick);
      if (item.n === selected) {
        const back = document.createElement('button');
        back.type = 'button';
        back.textContent = '↩ 이 버전으로 되돌리기';
        back.addEventListener('click', () => {
          setCode(item.code);
          say(`${item.n}번 시도의 코드를 편집기에 가져왔어요. ▶ 실행을 눌러 다시 해 봐요.`);
        });
        li.append(back);
      }
      list.append(li);
    }
  }

  function text() {
    const mission = getMissionTitle();
    const out = ['[내가 만드는 규칙 · 시도 기록]'];
    if (mission) out.push(`미션: ${mission}`);
    for (const v of versions) {
      out.push('', `${v.n}번 시도 (${timeText(v.t)})`);
      for (const [key, label] of FIELDS) if (v[key]) out.push(`- ${label}: ${v[key]}`);
      out.push('```', v.code.trim(), '```');
    }
    return out.join('\n');
  }

  container.querySelector('[data-copy]').addEventListener('click', async () => {
    if (!versions.length) return say('복사할 기록이 아직 없어요.');
    try {
      await navigator.clipboard.writeText(text());
      say('복사했어요. 원하는 곳에 붙여 넣으세요.');
    } catch {
      say('복사하지 못했어요. 브라우저가 복사를 막고 있어요.');
    }
  });

  container.querySelector('[data-clear]').addEventListener('click', () => {
    if (!versions.length) return;
    if (!confirm('시도 기록을 모두 지울까요? 되돌릴 수 없어요.')) return;
    versions = [];
    selected = null;
    save();
    render();
    say('기록을 지웠어요.');
  });

  render();

  return {
    // ▶ 실행할 때 부른다. 바로 앞 버전과 코드가 같으면 새 버전을 만들지 않는다.
    addVersion(code) {
      const last = versions[versions.length - 1];
      if (last && last.code === code) {
        selected = last.n;
        if (draft && !last.think) {
          last.think = draft; // 같은 코드를 다시 실행했지만 예상을 새로 적은 경우
          setDraft('');
          autoFilled = '';
          save();
        }
      } else {
        const n = (last?.n ?? 0) + 1;
        versions.push({ n, t: Date.now(), code, think: draft, result: '', fix: '' });
        setDraft('');
        autoFilled = '';
        if (versions.length > MAX_VERSIONS) versions.shift();
        selected = n;
        save();
      }
      render();
    },
    getDraft: () => draft,
    setDraft: (t) => setDraft(t),
    onDraft(fn) {
      draftListeners.add(fn);
      return () => draftListeners.delete(fn);
    },
    destroy() {
      clearTimeout(saveTimer);
      save();
    },
  };
}
