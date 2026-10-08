import { LiveChart } from '../../shared/ui/chart.js';

// 센서 대시보드 모드: 센서값을 실시간 그래프로 보고, LED에 그림을 보내 본다.
export function mount(root, { conn }) {
  root.innerHTML = `
    <section class="card" aria-labelledby="h-dash">
      <h2 id="h-dash">📈 센서 그래프</h2>
      <p class="small">① 마이크로비트를 흔들거나 기울여 보세요. 그래프가 같이 움직여요.</p>

      <canvas aria-label="움직임 숫자가 실시간으로 움직이는 그래프"></canvas>
      <div class="legend" aria-label="그래프 범례">
        <span style="--c:#ef4444">x(좌우) <b data-val="x">–</b></span>
        <span style="--c:#16a34a">y(앞뒤) <b data-val="y">–</b></span>
        <span style="--c:#3b82f6">z(위아래) <b data-val="z">–</b></span>
      </div>
      <div class="rate" data-rate>초당 움직임 숫자: –</div>

      <h2 style="margin-top:18px">② LED 시험해 보기</h2>
      <p class="small" style="margin-top:-4px">컴퓨터가 마이크로비트에게 말을 거는 거예요. 마이크로비트 화면을 보세요.</p>
      <div class="actions">
        <button class="ghost" data-icon="heart">💗 하트</button>
        <button class="ghost" data-icon="happy">😀 웃는 얼굴</button>
        <button class="ghost" data-icon="sad">😢 우는 얼굴</button>
        <button class="ghost" data-icon="clear">⬛ 끄기</button>
      </div>
      <div class="small" data-sim-command hidden></div>
    </section>`;

  const $ = (sel) => root.querySelector(sel);
  const chart = new LiveChart($('canvas'));
  const ledButtons = root.querySelectorAll('[data-icon]');
  const simCommand = $('[data-sim-command]');

  let last = null;
  let count = 0;
  let lastCount = 0;
  let lastAt = performance.now();

  function refresh() {
    ledButtons.forEach((b) => (b.disabled = !conn.connected));
    if (!conn.connected) simCommand.hidden = true;
  }

  ledButtons.forEach((b) => b.addEventListener('click', () => conn.send('icon:' + b.dataset.icon)));

  const offs = [
    conn.on('sample', (s) => {
      last = s;
      count++;
      chart.push(s);
    }),
    conn.on('status', ({ state }) => {
      if (state === 'disconnected') {
        chart.clear();
        last = null;
        count = lastCount = 0;
        lastAt = performance.now();
        root.querySelectorAll('[data-val]').forEach((el) => (el.textContent = '–'));
        $('[data-rate]').textContent = '초당 움직임 숫자: –';
      }
      refresh();
    }),
    conn.on('command', (line) => {
      simCommand.hidden = false;
      simCommand.textContent = `마우스로 해 보기: 마이크로비트에게 "${line}" 라고 말했어요.`;
    }),
  ];
  refresh();

  // 숫자와 초당 개수는 0.25초마다 갱신 (너무 자주 바꾸면 읽기 힘들다)
  const timer = setInterval(() => {
    if (!last) return;
    for (const k of ['x', 'y', 'z']) $(`[data-val="${k}"]`).textContent = last[k];
    const now = performance.now();
    if (now - lastAt >= 1000) {
      const hz = Math.round(((count - lastCount) * 1000) / (now - lastAt));
      $('[data-rate]').textContent = `초당 움직임 숫자: ${hz}개`;
      lastAt = now;
      lastCount = count;
    }
  }, 250);

  return () => {
    offs.forEach((off) => off());
    clearInterval(timer);
    chart.destroy();
  };
}
