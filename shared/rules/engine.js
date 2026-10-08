// 학생 규칙을 일꾼(Worker)에서 돌리는 도우미.
// - 센서값은 한 번에 하나씩만 일꾼에게 보낸다. (일꾼이 바쁘면 가장 새 값만 기다린다)
// - 일꾼이 TIME_LIMIT 안에 대답하지 않으면 무한 반복으로 보고 일꾼을 멈춘다.
const TIME_LIMIT = 1500; // 밀리초
const LOOP_MESSAGE = '규칙이 끝나지 않고 계속 돌고 있어요. 무한 반복인 것 같아요. 반복() 안에 끝나지 않는 일(while 같은 것)이 있는지 봐요.';

// callbacks: { onAction(name, arg), onReady({hasLoop, hasButton}), onError({message, line}) }
export class RuleRunner {
  #worker = null;
  #busy = false;
  #timer = 0;
  #pendingTick = null;
  #pendingButtons = [];
  #cb;

  constructor(callbacks) {
    this.#cb = callbacks;
  }

  get running() {
    return this.#worker !== null;
  }

  start(code) {
    this.stop();
    const worker = new Worker(new URL('./worker.js', import.meta.url));
    this.#worker = worker;
    worker.onmessage = (e) => this.#onMessage(e.data);
    worker.onerror = (e) => {
      e.preventDefault();
      this.#fail('규칙을 실행하지 못했어요.', null);
    };
    this.#post({ type: 'run', code });
  }

  stop() {
    clearTimeout(this.#timer);
    this.#worker?.terminate();
    this.#worker = null;
    this.#busy = false;
    this.#pendingTick = null;
    this.#pendingButtons = [];
  }

  push(sample) {
    this.#send({ type: 'tick', x: sample.x, y: sample.y, z: sample.z });
  }

  button(name) {
    this.#send({ type: 'button', name });
  }

  #send(msg) {
    if (!this.#worker) return;
    if (!this.#busy) return this.#post(msg);
    if (msg.type === 'tick') this.#pendingTick = msg;
    else if (this.#pendingButtons.length < 10) this.#pendingButtons.push(msg);
  }

  #post(msg) {
    this.#busy = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#fail(LOOP_MESSAGE, null), TIME_LIMIT);
    this.#worker.postMessage(msg);
  }

  #onMessage(d) {
    if (d.type === 'action') return this.#cb.onAction(d.name, d.arg);
    if (d.type === 'error') return this.#fail(d.message, d.line);
    if (d.type === 'ready') this.#cb.onReady?.(d);
    // 'ready'와 'done'은 일을 끝냈다는 뜻이다. 기다리던 것이 있으면 이어서 보낸다.
    clearTimeout(this.#timer);
    this.#busy = false;
    const button = this.#pendingButtons.shift(); // 버튼은 놓치면 안 되니 센서값보다 먼저 보낸다
    if (button) return this.#post(button);
    const tick = this.#pendingTick;
    this.#pendingTick = null;
    if (tick) this.#post(tick);
  }

  #fail(message, line) {
    this.stop();
    this.#cb.onError({ message, line });
  }
}
