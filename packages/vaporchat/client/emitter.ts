type Listeners<Events> = {
  [K in keyof Events]?: Set<(payload: Events[K]) => void>;
};

/** Minimal typed event emitter that works in browsers and webviews. */
export class Emitter<Events extends object> {
  #listeners: Listeners<Events> = {};

  /** Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void) {
    let listeners = this.#listeners[event];
    if (!listeners) {
      listeners = new Set();
      this.#listeners[event] = listeners;
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]) {
    for (const listener of this.#listeners[event] ?? []) {
      listener(payload);
    }
  }
}
