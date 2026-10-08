import { Emitter } from './emitter.js';
import { SerialDevice } from './serial.js';
import { BleDevice } from './ble.js';
import { SimulatorDevice } from './simulator.js';

// 앱 전체에서 하나만 쓰는 "연결"이다.
// 모드(대시보드, 제스처 등)가 바뀌어도 연결은 그대로 유지되고, 모드는 여기서 값을 받아 쓴다.
// 이벤트: status {state, kind, message?}, sample, button, command, hello, info {hw}
export class Connection extends Emitter {
  #device = null;

  get connected() {
    return this.#device?.connected ?? false;
  }

  get kind() {
    return this.#device?.kind ?? null; // 'serial' | 'ble' | 'simulator' | null
  }

  async useSerial() {
    if (!SerialDevice.supported()) {
      const err = new Error('이 브라우저는 USB 연결을 지원하지 않아요.');
      err.name = 'UnsupportedError';
      throw err;
    }
    await this.#attach(new SerialDevice());
  }

  async useBle() {
    if (!BleDevice.supported()) {
      const err = new Error('이 브라우저는 블루투스 연결을 지원하지 않아요.');
      err.name = 'UnsupportedError';
      throw err;
    }
    await this.#attach(new BleDevice());
  }

  async useSimulator(padEl) {
    await this.#attach(new SimulatorDevice(padEl));
  }

  async disconnect() {
    await this.#device?.disconnect();
  }

  async send(line) {
    await this.#device?.send(line);
  }

  async #attach(device) {
    if (this.#device) await this.#device.disconnect();
    this.#device = device;
    for (const type of ['sample', 'button', 'command', 'hello', 'info']) {
      device.on(type, (data) => {
        if (this.#device === device) this.emit(type, data);
      });
    }
    device.on('status', (info) => {
      if (this.#device !== device) return;
      this.emit('status', { ...info, kind: device.kind });
      if (info.state === 'disconnected') this.#device = null;
    });
    try {
      await device.connect();
    } catch (err) {
      this.#device = null;
      throw err;
    }
  }
}
