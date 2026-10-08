// AI 힌트: 답을 알려 주지 않고, 학생이 다시 생각하게 하는 질문만 돌려준다.
// 쓰는 순서: ① 내가 넣은 키(이 브라우저에만 저장) → ② 이 기기 안의 AI(Chrome) → ③ 서버(/api/hint)
// 서버 쪽 글(api/hint.js)과 SYSTEM 글은 같은 뜻으로 맞춰 둔다.

export const KEY_STORE = 'microlab.ai.key';
export const MODEL_STORE = 'microlab.ai.model';
// 2026-10-08 공식 문서(deprecations·pricing)에서 확인: 단종 예정 없음, 입력 $0.30 / 출력 $2.50 (1M 토큰)
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const SYSTEM = [
  '너는 초등학생·중학생이 센서 규칙을 만들 때 곁에서 돕는 선생님이야.',
  '절대 정답이나 고친 코드를 알려 주지 마. 코드 조각, 숫자 정답, 코드 블록도 쓰지 마.',
  '학생이 스스로 생각하도록 "질문" 1~2개와 "살펴볼 곳" 1가지만 말해 줘.',
  '쉬운 한국어로 3문장 안에 짧게 말해. 칭찬은 한마디만 해.',
  '센서 값 이름: x, y, z(기울기), 세기, 흔들림. 반응: 하트, 웃음, 울음, 예, 아니오, 끄기, 말하기, 점프.',
].join('\n');

function clip(text, n) {
  return String(text ?? '').slice(0, n);
}

function userText({ code, prediction, log, error }) {
  return [
    `[학생의 예상] ${clip(prediction, 200) || '(안 적음)'}`,
    `[학생의 규칙]\n${clip(code, 3000) || '(비어 있음)'}`,
    `[최근 반응] ${clip(log, 300) || '(아직 없음)'}`,
    `[오류] ${clip(error, 300) || '(없음)'}`,
    '이 학생에게 힌트 질문을 해 줘.',
  ].join('\n');
}

// 정답을 알려 주는 대답이 오면 그대로 보여 주지 않는다
function safe(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('AI가 대답을 못 했어요. 다시 눌러 보세요.');
  if (t.includes('```') || /function\s|=>|\bif\s*\(/.test(t)) {
    return '코드를 바로 알려 주는 대신 이렇게 물어볼게요. 내 규칙에서 "언제" 반응하게 했는지 말로 한 줄 적어 보고, 그래프의 선과 비교해 볼래요?';
  }
  return t;
}

export function getSettings() {
  try {
    return { key: localStorage.getItem(KEY_STORE) || '', model: localStorage.getItem(MODEL_STORE) || '' };
  } catch {
    return { key: '', model: '' };
  }
}

export function saveSettings({ key, model }) {
  try {
    if (key) localStorage.setItem(KEY_STORE, key.trim());
    else localStorage.removeItem(KEY_STORE);
    if (model) localStorage.setItem(MODEL_STORE, model.trim());
    else localStorage.removeItem(MODEL_STORE);
  } catch {
    throw new Error('이 브라우저에서는 저장을 못 해요.');
  }
}

async function viaKey(input, { key, model }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || DEFAULT_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userText(input) }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
      }),
    },
  );
  if (!res.ok) {
    if (res.status === 400 || res.status === 403) throw new Error('키가 맞지 않는 것 같아요. ⚙️에서 다시 확인해 보세요.');
    if (res.status === 429) throw new Error('지금은 AI가 바빠요. 잠깐 뒤에 다시 눌러 보세요.');
    throw new Error('AI 연결에 실패했어요. (' + res.status + ')');
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
}

async function viaLocal(input) {
  const LM = globalThis.LanguageModel;
  if (!LM || (await LM.availability()) !== 'available') return null; // 내려받기가 필요하면 쓰지 않는다
  const session = await LM.create({ initialPrompts: [{ role: 'system', content: SYSTEM }] });
  try {
    return await session.prompt(userText(input));
  } finally {
    session.destroy?.();
  }
}

async function viaServer(input) {
  let res;
  try {
    res = await fetch('/api/hint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    return null;
  }
  if (res.status === 404 || res.status === 405 || res.status === 501) return null; // 서버 기능이 없는 곳 (내 컴퓨터 등)
  if (res.status === 429) throw new Error('지금은 AI가 바빠요. 잠깐 뒤에 다시 눌러 보세요.');
  if (!res.ok) throw new Error('AI 연결에 실패했어요. (' + res.status + ')');
  return (await res.json()).hint || '';
}

export const NO_AI_MESSAGE = '아직 쓸 수 있는 AI가 없어요. ⚙️를 눌러 선생님이 알려 준 키를 넣어 보세요.';

// 힌트 글을 돌려준다. 쓸 수 있는 AI가 없으면 NO_AI_MESSAGE 오류를 던진다.
export async function askHint(input) {
  const settings = getSettings();
  if (settings.key) return safe(await viaKey(input, settings));
  try {
    const local = await viaLocal(input);
    if (local) return safe(local);
  } catch {
    // 이 기기 AI가 안 되면 다음 방법으로
  }
  const server = await viaServer(input);
  if (server) return safe(server);
  throw new Error(NO_AI_MESSAGE);
}
