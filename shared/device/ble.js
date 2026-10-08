import { Emitter } from './emitter.js';
import { handleLine, lineSplitter } from './protocol.js';

// 마이크로비트 블루투스 UART 서비스 (글자를 주고받는 통로)
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // 컴퓨터 -> 마이크로비트 (쓰기)
const UART_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // 마이크로비트 -> 컴퓨터 (알림)
const CHUNK = 20; // 블루투스 한 번에 보낼 수 있는 글자 수

// 블루투스로 마이크로비트(v2)와 대화한다. 주고받는 말은 USB와 똑같다.
// 이벤트: status {state, message?}, sample, button, hello, info {hw}
export class BleDevice extends Emitter {
  kind = 'ble';
  #device = null;
  #rx = null;
  #tx = null;
  #closing = false;
  #queue = Promise.resolve();
  #onDisconnected = () => this.#cleanup();

  static supported() {
    return 'bluetooth' in navigator;
  }

  get connected() {
    return this.#device?.gatt?.connected ?? false;
  }

  async connect() {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'BBC micro:bit' }],
      optionalServices: [UART_SERVICE],
    });
    this.#device = device;
    this.#closing = false;
    device.addEventListener('gattserverdisconnected', this.#onDisconnected);
    let stage = '연결';
    try {
      const server = await device.gatt.connect();
      stage = '서비스 찾기';
      const service = await server.getPrimaryService(UART_SERVICE);
      stage = '통로 찾기';
      const a = await service.getCharacteristic(UART_RX);
      const b = await service.getCharacteristic(UART_TX);
      // 통로 두 개의 성질을 보고 역할을 정한다: 알림을 주는 쪽 = 받는 통로, 쓸 수 있는 쪽 = 보내는 통로
      const canNotify = (c) => c.properties.notify || c.properties.indicate;
      const canWrite = (c) => c.properties.write || c.properties.writeWithoutResponse;
      this.#tx = [b, a].find(canNotify);
      this.#rx = [a, b].find((c) => c !== this.#tx && canWrite(c));
      if (!this.#tx || !this.#rx) {
        const p = (c) => Object.keys(c.properties).filter((k) => c.properties[k]).join('+');
        throw new Error(`통로 성질이 달라요 (${a.uuid.slice(0, 8)}: ${p(a)}, ${b.uuid.slice(0, 8)}: ${p(b)})`);
      }
      const split = lineSplitter((line) => handleLine(line, (type, data) => this.emit(type, data)));
      const decoder = new TextDecoder();
      this.#tx.addEventListener('characteristicvaluechanged', (e) => {
        split(decoder.decode(e.target.value, { stream: true }));
      });
      stage = '알림 켜기';
      await this.#tx.startNotifications();
      stage = '시작 신호 보내기';
      await this.#write('start'); // 이제 받을 준비가 됐으니 센서값을 보내도 된다고 알린다
    } catch (err) {
      device.removeEventListener('gattserverdisconnected', this.#onDisconnected);
      if (device.gatt.connected) device.gatt.disconnect();
      this.#device = null;
      this.#rx = null;
      this.#tx = null;
      // 브라우저 오류의 message는 고칠 수 없어서 새 오류로 감싼다 (name은 그대로 둔다)
      const wrapped = new Error(`[${stage}] ${err.message}`);
      wrapped.name = err.name;
      throw wrapped;
    }
    this.emit('status', { state: 'connected' });
  }

  async disconnect() {
    this.#closing = true;
    if (this.#device?.gatt?.connected) this.#device.gatt.disconnect();
    else this.#cleanup();
  }

  // 블루투스는 한 번에 20글자까지만 보낼 수 있어서 잘라서 차례로 보낸다.
  send(line) {
    if (!this.#rx) return Promise.resolve();
    this.#queue = this.#queue.then(() => this.#write(line)).catch(() => {}); // 끊긴 뒤의 쓰기 실패는 무시
    return this.#queue;
  }

  async #write(line) {
    const bytes = new TextEncoder().encode(line + '\n');
    // 마이크로비트가 "응답 없이 쓰기"를 지원하면 그걸 쓰고, 아니면 일반 쓰기를 쓴다.
    const fast = this.#rx.properties.writeWithoutResponse;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk = bytes.slice(i, i + CHUNK);
      if (fast) await this.#rx.writeValueWithoutResponse(chunk);
      else await this.#rx.writeValueWithResponse(chunk);
    }
  }

  #cleanup() {
    const device = this.#device;
    if (!device) return;
    device.removeEventListener('gattserverdisconnected', this.#onDisconnected);
    this.#device = null;
    this.#rx = null;
    this.#tx = null;
    this.emit('status', this.#closing ? { state: 'disconnected' } : { state: 'disconnected', message: '블루투스 연결이 끊어졌어요.' });
  }
}
