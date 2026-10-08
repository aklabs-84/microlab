// 코드 입력창 도우미: 괄호·따옴표 자동 닫기, Enter 자동 들여쓰기, Tab/Shift+Tab, 코드 정리, 괄호 짝 검사.
// 규칙 내용은 학생이 직접 쓰고, 기호 실수만 줄여 준다.
const PAIRS = { '(': ')', '{': '}', '[': ']', '"': '"', "'": "'" };
const CLOSERS = new Set([')', '}', ']', '"', "'"]);
const INDENT = '  ';

// 글자 바꾸기: 되돌리기(⌘Z)가 되도록 execCommand를 먼저 쓰고, 안 되면 직접 바꾼다.
function replaceRange(ta, start, end, text, selStart, selEnd) {
  ta.focus();
  ta.setSelectionRange(start, end);
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }
  if (!ok) {
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  ta.setSelectionRange(selStart ?? start + text.length, selEnd ?? selStart ?? start + text.length);
}

function lineStart(value, pos) {
  return value.lastIndexOf('\n', pos - 1) + 1;
}

// 문자열·주석을 빼고 괄호 글자만 남겨 센다.
function stripNoise(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const two = code.slice(i, i + 2);
    if (two === '//') {
      while (i < code.length && code[i] !== '\n') i++;
    } else if (two === '/*') {
      const end = code.indexOf('*/', i + 2);
      i = end < 0 ? code.length : end + 2;
    } else if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < code.length && code[i] !== c && code[i] !== '\n') {
        if (code[i] === '\\') i++;
        i++;
      }
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// 괄호 짝이 안 맞으면 쉬운 말로 알려 주고, 맞으면 ''를 돌려준다.
export function bracketHint(code) {
  const clean = stripNoise(code);
  const names = { '{': ['{ }', '중괄호'], '(': ['( )', '소괄호'], '[': ['[ ]', '대괄호'] };
  const closeOf = { '{': '}', '(': ')', '[': ']' };
  const openOf = { '}': '{', ')': '(', ']': '[' };
  const stack = [];
  for (const c of clean) {
    if (closeOf[c]) stack.push(c);
    else if (openOf[c]) {
      const top = stack.pop();
      if (top !== openOf[c]) {
        const [sym, label] = names[openOf[c]];
        return `${label} ${sym}의 짝이 맞지 않아요. 닫는 ${c}가 너무 많거나, 순서가 섞였어요.`;
      }
    }
  }
  if (stack.length) {
    const open = stack[stack.length - 1];
    const n = stack.filter((c) => c === open).length;
    const [sym, label] = names[open];
    return `${label} ${sym}가 ${n}개 닫히지 않았어요. 닫는 ${closeOf[open]}를 더해 주세요.`;
  }
  const quotes = (code.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').match(/"/g) ?? []).length;
  if (quotes % 2) return '따옴표(")가 홀수 개예요. 글자를 감싸는 따옴표를 닫았는지 봐 주세요.';
  return '';
}

// 코드 정리: 중괄호 깊이에 맞춰 줄마다 들여쓰기를 다시 맞춘다.
export function formatCode(code) {
  let depth = 0;
  const lines = code.replace(/\t/g, INDENT).split('\n');
  const out = lines.map((raw) => {
    const t = raw.trim();
    if (!t) return '';
    const clean = stripNoise(t);
    const lead = /^[}\])]+/.exec(clean)?.[0].length ?? 0;
    const level = Math.max(0, depth - lead);
    const opens = (clean.match(/[{(\[]/g) ?? []).length;
    const closes = (clean.match(/[})\]]/g) ?? []).length;
    depth = Math.max(0, depth + opens - closes);
    return INDENT.repeat(level) + t;
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

export function attachEditorAssist(ta, { onRun } = {}) {
  function indentLines(shift) {
    const { value, selectionStart: s, selectionEnd: e } = ta;
    const from = lineStart(value, s);
    const to = e > s && value[e - 1] === '\n' ? e - 1 : e;
    const block = value.slice(from, to);
    const lines = block.split('\n');
    let firstDelta = 0;
    let total = 0;
    const next = lines.map((l, i) => {
      if (!shift) {
        if (i === 0) firstDelta = INDENT.length;
        total += INDENT.length;
        return INDENT + l;
      }
      const m = /^ {1,2}/.exec(l)?.[0].length ?? 0;
      if (i === 0) firstDelta = -m;
      total -= m;
      return l.slice(m);
    });
    replaceRange(ta, from, to, next.join('\n'), Math.max(from, s + firstDelta), e + total);
  }

  function onKeydown(ev) {
    if (ta.readOnly) return; // 블록이 만든 코드를 보여 주는 중에는 건드리지 않는다
    if (ev.isComposing || ev.keyCode === 229) return; // 한글 조합 중에는 건드리지 않는다
    const { value, selectionStart: s, selectionEnd: e } = ta;
    const key = ev.key;

    if (key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      onRun?.();
      return;
    }

    if (key === 'Tab') {
      ev.preventDefault();
      const multi = value.slice(s, e).includes('\n');
      if (ev.shiftKey || multi) indentLines(ev.shiftKey);
      else replaceRange(ta, s, e, INDENT);
      return;
    }

    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    if (key === 'Enter') {
      ev.preventDefault();
      const ls = lineStart(value, s);
      const indent = /^[ ]*/.exec(value.slice(ls, s))[0];
      const before = value.slice(0, s).trimEnd().slice(-1);
      const after = value[e];
      if (before === '{' && after === '}') {
        const mid = '\n' + indent + INDENT;
        replaceRange(ta, s, e, mid + '\n' + indent, s + mid.length);
      } else {
        const extra = before === '{' ? INDENT : '';
        replaceRange(ta, s, e, '\n' + indent + extra);
      }
      return;
    }

    if (key === 'Backspace' && s === e && s > 0) {
      const a = value[s - 1];
      if (PAIRS[a] && value[s] === PAIRS[a]) {
        ev.preventDefault();
        replaceRange(ta, s - 1, s + 1, '', s - 1);
      }
      return;
    }

    if (CLOSERS.has(key) && s === e && value[s] === key) {
      ev.preventDefault(); // 이미 자동으로 닫혀 있으면 그 위를 지나간다
      ta.setSelectionRange(s + 1, s + 1);
      return;
    }

    if (PAIRS[key]) {
      const close = PAIRS[key];
      if (s !== e) {
        ev.preventDefault(); // 고른 글자를 감싼다
        replaceRange(ta, s, e, key + value.slice(s, e) + close, s + 1, e + 1);
        return;
      }
      const next = value[s];
      const prev = value[s - 1];
      const isQuote = key === '"' || key === "'";
      const nextOk = next === undefined || /\s/.test(next) || CLOSERS.has(next);
      const prevWord = prev !== undefined && /[\w가-힣]/.test(prev);
      if (nextOk && !(isQuote && prevWord)) {
        ev.preventDefault();
        replaceRange(ta, s, e, key + close, s + 1);
      }
    }
  }

  ta.addEventListener('keydown', onKeydown);
  return () => ta.removeEventListener('keydown', onKeydown);
}
