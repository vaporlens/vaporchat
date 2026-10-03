import { createRequire } from 'node:module';
import SteamUser from 'steam-user';

// steam-user only ships encoders for the service methods it uses itself, so voice/webrtc
// calls go through its internals with protobuf types from its bundled schema
const require = createRequire(import.meta.url);

interface ProtoType {
  fromObject(object: object): object;
  encode(message: object): { finish(): Uint8Array };
  decode(data: Uint8Array): object;
  toObject(message: object, options: { longs: StringConstructor }): object;
}
const Schema: Record<
  string,
  ProtoType
> = require('steam-user/protobufs/generated/_load.js');

interface ByteBufferLike {
  toBuffer(): Buffer;
}
interface ServiceResponseHeader {
  proto: { eresult?: number; error_message?: string };
}
// steam-user hands over decoded objects for messages it knows and raw ByteBuffers otherwise
type IncomingBody = ByteBufferLike | object;

interface SteamUserInternals {
  _send(
    header: { msg: number; proto: { target_job_name: string } },
    body: Uint8Array,
    callback?: (body: IncomingBody, header: ServiceResponseHeader) => void,
  ): void;
  _handlerManager: {
    add(
      name: string,
      handler: (this: SteamUser, body: IncomingBody) => void,
    ): void;
  };
}

function internals(client: SteamUser) {
  return client as unknown as SteamUserInternals;
}

function protoType(name: string) {
  const type = Schema[name];
  if (!type) {
    throw new Error(`steam-user schema has no protobuf ${name}`);
  }
  return type;
}

function decode<T>(typeName: string, body: IncomingBody): T {
  if (!('toBuffer' in body)) {
    return body as T;
  }
  const type = protoType(typeName);
  return type.toObject(type.decode(body.toBuffer()), { longs: String }) as T;
}

function encode(typeName: string, body: object) {
  const type = protoType(typeName);
  return type.encode(type.fromObject(body)).finish();
}

export class SteamServiceError extends Error {
  eresult: number;
  constructor(method: string, eresult: number, message?: string) {
    super(
      `${method} failed: ${SteamUser.EResult[eresult] ?? eresult}${message ? ` (${message})` : ''}`,
    );
    this.eresult = eresult;
  }
}

const SERVICE_CALL_TIMEOUT_MS = 15_000;

function sendServiceMethod(
  client: SteamUser,
  method: string,
  requestType: string,
  body: object,
  onResponse?: (body: IncomingBody, header: ServiceResponseHeader) => void,
) {
  if (!client.steamID) {
    throw new Error(`Cannot send ${method}: not logged on to Steam`);
  }
  internals(client)._send(
    {
      msg: SteamUser.EMsg.ServiceMethodCallFromClient,
      proto: { target_job_name: method },
    },
    encode(requestType, body),
    onResponse,
  );
}

/** Calls a unified service method, e.g. `ChatRoom.JoinVoiceChat#1`. 64-bit ids are strings both ways. */
export function callService<Res>(
  client: SteamUser,
  method: string,
  requestType: string,
  responseType: string,
  body: object,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    sendServiceMethod(
      client,
      method,
      requestType,
      body,
      (responseBody, header) => {
        clearTimeout(timeout);
        const eresult = header.proto.eresult ?? SteamUser.EResult.Fail;
        if (eresult !== SteamUser.EResult.OK) {
          reject(
            new SteamServiceError(method, eresult, header.proto.error_message),
          );
          return;
        }
        try {
          resolve(decode<Res>(responseType, responseBody));
        } catch (err) {
          reject(err);
        }
      },
    );
    // steam-user never calls back if the connection drops mid-call
    const timeout = setTimeout(
      () => reject(new Error(`${method} timed out`)),
      SERVICE_CALL_TIMEOUT_MS,
    );
  });
}

/** Sends a one-way service notification (no response), e.g. `VoiceChat.NotifyUserVoiceStatus#1`. */
export function notifyService(
  client: SteamUser,
  method: string,
  requestType: string,
  body: object,
) {
  sendServiceMethod(client, method, requestType, body);
}

type NotificationListener = (body: object) => void;

// steam-user's handler registry is shared by every SteamUser instance (and dedupes handlers by source text),
// so each notification gets one prototype-level handler that dispatches to the receiving client's listeners
const listenersByClient = new WeakMap<
  SteamUser,
  Map<string, Set<NotificationListener>>
>();
const registeredNotifications = new Set<string>();

function registerNotification(name: string, typeName: string) {
  if (registeredNotifications.has(name)) return;
  registeredNotifications.add(name);
  internals(SteamUser.prototype as SteamUser)._handlerManager.add(
    name,
    function (body) {
      const listeners = listenersByClient.get(this)?.get(name);
      if (!listeners?.size) return;
      const decoded = decode<object>(typeName, body);
      for (const listener of listeners) listener(decoded);
    },
  );
}

/** Subscribes to a service notification, e.g. `VoiceChatClient.NotifyUserJoinedVoiceChat#1`. Returns an unsubscribe function. */
export function onServiceNotification(
  client: SteamUser,
  name: string,
  typeName: string,
  listener: NotificationListener,
) {
  registerNotification(name, typeName);
  let byName = listenersByClient.get(client);
  if (!byName) {
    byName = new Map();
    listenersByClient.set(client, byName);
  }
  let listeners = byName.get(name);
  if (!listeners) {
    listeners = new Set();
    byName.set(name, listeners);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}
