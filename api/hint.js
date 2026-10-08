// Vercel 서버 함수: 학생 브라우저 대신 Gemini를 불러서 API 키를 숨긴다.
// 환경변수 (Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY  필수. Google AI Studio에서 만든 키
//   GEMINI_MODEL    선택. 없으면 아래 DEFAULT_MODEL (단종되면 코드 수정 없이 여기서 바꾼다)
// 힌트 글(SYSTEM)은 shared/ai/hint.js와 같은 뜻으로 맞춰 둔다.

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const SYSTEM = [
  '너는 초등학생·중학생이 센서 규칙을 만들 때 곁에서 돕는 선생님이야.',
  '절대 정답이나 고친 코드를 알려 주지 마. 코드 조각, 숫자 정답, 코드 블록도 쓰지 마.',
  '학생이 스스로 생각하도록 "질문" 1~2개와 "살펴볼 곳" 1가지만 말해 줘.',
  '쉬운 한국어로 3문장 안에 짧게 말해. 칭찬은 한마디만 해.',
  '센서 값 이름: x, y, z(기울기), 세기, 흔들림. 반응: 하트, 웃음, 울음, 예, 아니오, 끄기, 말하기, 점프.',
].join('\n');

const clip = (text, n) => String(text ?? '').slice(0, n);

// 같은 서버가 살아 있는 동안 한 곳(IP)에서 너무 자주 부르면 막는다 (간단한 방어)
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 12;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(501).json({ error: 'AI 키가 서버에 없어요' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) return res.status(429).json({ error: 'too many' });

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const text = [
    `[학생의 예상] ${clip(b.prediction, 200) || '(안 적음)'}`,
    `[학생의 규칙]\n${clip(b.code, 3000) || '(비어 있음)'}`,
    `[최근 반응] ${clip(b.log, 300) || '(아직 없음)'}`,
    `[오류] ${clip(b.error, 300) || '(없음)'}`,
    '이 학생에게 힌트 질문을 해 줘.',
  ].join('\n');

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
        }),
      },
    );
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: 'upstream ' + r.status });
    const data = await r.json();
    const hint = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return res.status(200).json({ hint });
  } catch {
    return res.status(502).json({ error: 'upstream failed' });
  }
};
