import type {
  ClientMessage,
  ClientNotificationName,
  MethodName,
  Methods,
  ServerMessage,
  ServerNotificationName,
  ServerNotifications,
  SteamClientNotifications,
} from '../protocol.ts';
import { Emitter } from './emitter.ts';

export class RpcError extends Error {
  eresult?: number;
  constructor(message: string, eresult?: number) {
    super(message);
    this.eresult = eresult;
  }
}

interface PendingCall {
  resolve: (body: unknown) => void;
  reject: (err: Error) => void;
}

type NotificationEvents = {
  [N in ServerNotificationName]: ServerNotifications[N];
} & { close: { code: number; reason: string } };

/** Websocket link to the vaporchat server, which owns the Steam session. */
export class VoiceConnection extends Emitter<NotificationEvents> {
  #socket: WebSocket;
  #nextId = 1;
  #pending = new Map<number, PendingCall>();
  readonly ready: Promise<void>;

  constructor(url: string) {
    super();
    this.#socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.#socket.addEventListener('open', () => resolve(), { once: true });
      this.#socket.addEventListener(
        'error',
        () => reject(new Error(`Could not connect to ${url}`)),
        { once: true },
      );
    });
    this.#socket.addEventListener('message', (event) => {
      this.#handle(JSON.parse(String(event.data)) as ServerMessage);
    });
    this.#socket.addEventListener('close', (event) => {
      for (const call of this.#pending.values()) {
        call.reject(new Error('Connection to vaporchat server closed'));
      }
      this.#pending.clear();
      this.emit('close', { code: event.code, reason: event.reason });
    });
  }

  #handle(message: ServerMessage) {
    if (message.kind === 'notification') {
      this.emit(message.name, message.body as never);
      return;
    }
    const call = this.#pending.get(message.id);
    if (!call) return;
    this.#pending.delete(message.id);
    if (message.kind === 'result') {
      call.resolve(message.body);
    } else {
      call.reject(new RpcError(message.message, message.eresult));
    }
  }

  #send(message: ClientMessage) {
    if (this.#socket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to vaporchat server');
    }
    this.#socket.send(JSON.stringify(message));
  }

  call<M extends MethodName>(
    method: M,
    body: Methods[M]['request'],
  ): Promise<Methods[M]['response']> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, {
        resolve: (result) => resolve(result as Methods[M]['response']),
        reject,
      });
      try {
        this.#send({ kind: 'call', id, method, body } as ClientMessage);
      } catch (err) {
        this.#pending.delete(id);
        reject(err);
      }
    });
  }

  notify<N extends ClientNotificationName>(
    name: N,
    body: SteamClientNotifications[N],
  ) {
    this.#send({ kind: 'notify', name, body });
  }

  close() {
    this.#socket.close();
  }
}
