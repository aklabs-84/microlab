import { Emitter } from './emitter.js';
import { handleLine, lineSplitter } from './protocol.js';

const MICROBIT_VENDOR_ID = 0x0d28;

// USB 시리얼로 마이크로비트(v1, v2)와 대화한다.
// 받는 말: "x,y,z" (센서값), "A"/"B" (버튼), "hello" (인사), "hw:1"/"hw:2" (버전)
// 보내는 말: "icon:heart" 처럼 한 줄짜리 명령
// 이벤트: status {state, message?}, sample {t,x,y,z}, button {name}, hello, info {hw}
export class SerialDevice extends Emitter {
  kind = 'serial';
  #port = null;
  #reader = null;
  #writer = null;
  #closing = false;

  static supported() {
    return 'serial' in navigator;
  }

  get connected() {
    return this.#port !== null;
  }

  async connect() {
    const port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: MICROBIT_VENDOR_ID }],
    });
    await port.open({ baudRate: 115200 });
    this.#port = port;
    this.#closing = false;
    this.#writer = port.writable.getWriter();
    this.emit('status', { state: 'connected' });
    this.#readLoop(port);
  }

  async disconnect() {
    this.#closing = true;
    try {
      await this.#reader?.cancel();
    } catch {
      // 이미 끊긴 경우: 무시
    }
    // 읽기 반복문이 끝나면서 #cleanup()이 실행된다.
  }

  async send(line) {
    if (!this.#writer) return;
    await this.#writer.write(new TextEncoder().encode(line + '\n'));
  }

  async #readLoop(port) {
    const decoder = new TextDecoder();
    const split = lineSplitter((line) => handleLine(line, (type, data) => this.emit(type, data)));
    try {
      while (port.readable && !this.#closing) {
        this.#reader = port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.#reader.read();
            if (done) break;
            split(decoder.decode(value, { stream: true }));
          }
        } finally {
          this.#reader.releaseLock();
          this.#reader = null;
        }
      }
    } catch (err) {
      if (!this.#closing) {
        this.emit('status', { state: 'error', message: err.message });
      }
    }
    await this.#cleanup();
  }

  async #cleanup() {
    const port = this.#port;
    if (!port) return;
    this.#port = null;
    try {
      this.#writer?.releaseLock();
    } catch {
      // 무시
    }
    this.#writer = null;
    try {
      await port.close();
    } catch {
      // 이미 닫힘
    }
    this.emit('status', { state: 'disconnected' });
  }
}
