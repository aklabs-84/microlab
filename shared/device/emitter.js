// 아주 작은 이벤트 도우미: on()으로 듣고 emit()으로 알린다.
export class Emitter {
  #handlers = new Map();

  on(type, fn) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(fn);
    return () => this.#handlers.get(type)?.delete(fn);
  }

  emit(type, data) {
    this.#handlers.get(type)?.forEach((fn) => fn(data));
  }
}
