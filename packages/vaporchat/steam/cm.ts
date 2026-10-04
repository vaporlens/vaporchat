import { gunzipSync } from 'fflate';
import { Emitter } from '../client/emitter.ts';
import { SteamError } from './eresult.ts';
import { decodeProto, encodeProto } from './protos.ts';
import { serviceTypeName } from './serviceTypes.ts';

// Steam's message ids (EMsg) this client sends or handles
export const EMsg = {
  Multi: 1,
  ServiceMethod: 146,
  ServiceMethodCallFromClient: 151,
  ClientHeartBeat: 703,
  ClientChangeStatus: 716,
  ClientLogOnResponse: 751,
  ClientLoggedOff: 757,
  ClientPersonaState: 766,
  ClientFriendsList: 767,
  ClientRequestFriendData: 815,
  ClientLogon: 5514,
  ServiceMethodCallFromClientNonAuthed: 9804,
  ClientHello: 9805,
} as const;

export const PROTOCOL_VERSION = 65580;
const PROTO_MASK = 0x80000000;
const EResultOK = 1;
const CONNECT_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 15_000;
const CM_LIST_URL =
  'https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?cellid=0';

export interface SteamConnectOptions {
  /**
   * Where to get Steam's server list (same JSON as Steam's GetCMListForConnect). Browsers need
   * this: Steam's API only allows CORS from steamcommunity.com, so a browser app has to serve
   * the list from its own backend. React Native and Node fetch Steam's API directly.
   */
  serverListUrl?: string;
}

export interface ProtoHeader {
  steamid?: string;
  client_sessionid?: number;
  jobid_source?: string;
  jobid_target?: string;
  target_job_name?: string;
  eresult?: number;
  error_message?: string;
  realm?: number;
}

type MessageHandler = (header: ProtoHeader, body: Uint8Array) => void;

interface PendingJob {
  resolve: (body: Uint8Array) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface CMServer {
  endpoint: string;
  type: string;
  realm: string;
}

async function pickWebSocketServer(serverListUrl = CM_LIST_URL) {
  const response = await fetch(serverListUrl);
  if (!response.ok) {
    throw new Error(`Could not get Steam servers: HTTP ${response.status}`);
  }
  const { response: list } = (await response.json()) as {
    response: { serverlist?: CMServer[] };
  };
  // the list comes sorted by load, spread clients over the best ones like steam-user does
  const servers = (list.serverlist ?? []).filter(
    (server) => server.type === 'websockets' && server.realm === 'steamglobal',
  );
  if (servers.length === 0) throw new Error('Steam returned no servers');
  const pick = Math.floor(Math.random() * Math.min(20, servers.length));
  return servers[pick].endpoint;
}

/**
 * Binary protobuf link to a Steam connection manager (CM) over WebSocket, the transport
 * Steam's own web and mobile clients use. Works anywhere with WebSocket + fetch
 * (browsers, React Native, Node, Bun).
 */
export class SteamCM extends Emitter<{ close: { reason: string } }> {
  #socket: WebSocket;
  #jobs = new Map<string, PendingJob>();
  #nextJobId = 1;
  #handlers = new Map<number | string, Set<MessageHandler>>();
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #isClosed = false;
  /** set once logged on, sent with every authenticated message */
  steamid = '0';
  #sessionId = 0;

  private constructor(socket: WebSocket) {
    super();
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      this.#receive(new Uint8Array(event.data as ArrayBuffer));
    });
    socket.addEventListener('close', (event) => {
      this.#closed(event.reason || `connection closed (${event.code})`);
    });
  }

  static async connect({ serverListUrl }: SteamConnectOptions = {}) {
    const endpoint = await pickWebSocketServer(serverListUrl);
    const socket = new WebSocket(`wss://${endpoint}/cmsocket/`);
    socket.binaryType = 'arraybuffer';
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`Connecting to Steam (${endpoint}) timed out`));
      }, CONNECT_TIMEOUT_MS);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`Could not connect to Steam (${endpoint})`));
      });
    });
    const cm = new SteamCM(socket);
    cm.send(EMsg.ClientHello, 'CMsgClientHello', {
      protocol_version: PROTOCOL_VERSION,
    });
    return cm;
  }

  get connected() {
    return this.#socket.readyState === WebSocket.OPEN;
  }

  /** Logged on: remember who we are and keep the session alive. */
  startSession(steamid: string, sessionId: number, heartbeatSeconds: number) {
    this.steamid = steamid;
    this.#sessionId = sessionId;
    this.#heartbeat = setInterval(() => {
      // the socket can be closing before its close event stops this timer
      if (this.connected) {
        this.send(EMsg.ClientHeartBeat, 'CMsgClientHeartBeat', {});
      }
    }, heartbeatSeconds * 1000);
  }

  send(emsg: number, typeName: string, body: object, header: ProtoHeader = {}) {
    this.#sendRaw(emsg, encodeProto(typeName, body), header);
  }

  /** Calls a service method (`Service.Method#1`), rejects with SteamError on a non-OK result. */
  async call<Res>(
    method: string,
    body: object,
    { authenticated = true } = {},
  ): Promise<Res> {
    const jobId = String(this.#nextJobId++);
    const response = new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#jobs.delete(jobId);
        reject(new Error(`Steam did not answer ${method}`));
      }, CALL_TIMEOUT_MS);
      this.#jobs.set(jobId, { resolve, reject, timer });
    });
    try {
      this.#sendRaw(
        authenticated
          ? EMsg.ServiceMethodCallFromClient
          : EMsg.ServiceMethodCallFromClientNonAuthed,
        encodeProto(serviceTypeName(method, 'Request'), body),
        { target_job_name: method, jobid_source: jobId, realm: 1 },
      );
    } catch (err) {
      clearTimeout(this.#jobs.get(jobId)?.timer);
      this.#jobs.delete(jobId);
      throw err;
    }
    return decodeProto<Res>(
      serviceTypeName(method, 'Response'),
      await response,
    );
  }

  /** One-way service notification (`Service.NotifyX#1`), Steam sends no reply. */
  notify(method: string, typeName: string, body: object) {
    this.send(EMsg.ServiceMethodCallFromClient, typeName, body, {
      target_job_name: method,
    });
  }

  /** Listens for a message id, or a service notification name. Returns an unsubscribe function. */
  onMessage(key: number | string, handler: MessageHandler) {
    let handlers = this.#handlers.get(key);
    if (!handlers) {
      handlers = new Set();
      this.#handlers.set(key, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  close() {
    this.#socket.close();
    this.#closed('closed');
  }

  #sendRaw(emsg: number, body: Uint8Array, header: ProtoHeader) {
    if (!this.connected) throw new Error('Not connected to Steam');
    const unauthenticated =
      emsg === EMsg.ClientHello ||
      emsg === EMsg.ServiceMethodCallFromClientNonAuthed;
    const headerBytes = encodeProto('CMsgProtoBufHeader', {
      steamid: unauthenticated ? '0' : this.steamid,
      client_sessionid: unauthenticated ? 0 : this.#sessionId,
      ...header,
    });
    const message = new Uint8Array(8 + headerBytes.length + body.length);
    const view = new DataView(message.buffer);
    view.setUint32(0, (emsg | PROTO_MASK) >>> 0, true);
    view.setUint32(4, headerBytes.length, true);
    message.set(headerBytes, 8);
    message.set(body, 8 + headerBytes.length);
    this.#socket.send(message);
  }

  #receive(message: Uint8Array) {
    const view = new DataView(
      message.buffer,
      message.byteOffset,
      message.byteLength,
    );
    const rawEmsg = view.getUint32(0, true);
    // everything this client talks about is protobuf, legacy binary messages are ignored
    if (!(rawEmsg & PROTO_MASK)) return;
    const emsg = (rawEmsg & ~PROTO_MASK) >>> 0;
    const headerLength = view.getUint32(4, true);
    const header = decodeProto<ProtoHeader>(
      'CMsgProtoBufHeader',
      message.subarray(8, 8 + headerLength),
    );
    const body = message.subarray(8 + headerLength);

    if (emsg === EMsg.Multi) {
      this.#receiveMulti(body);
      return;
    }
    const jobId = header.jobid_target ?? '';
    const job = this.#jobs.get(jobId);
    if (job) {
      this.#jobs.delete(jobId);
      clearTimeout(job.timer);
      const eresult = header.eresult ?? EResultOK;
      if (eresult === EResultOK) job.resolve(body);
      else
        job.reject(
          new SteamError(header.error_message || 'Steam error', eresult),
        );
      return;
    }
    const key =
      emsg === EMsg.ServiceMethod && header.target_job_name
        ? header.target_job_name
        : emsg;
    for (const handler of this.#handlers.get(key) ?? []) handler(header, body);
  }

  #receiveMulti(body: Uint8Array) {
    const multi = decodeProto<{
      size_unzipped?: number;
      message_body: Uint8Array;
    }>('CMsgMulti', body);
    let payload = multi.size_unzipped
      ? gunzipSync(multi.message_body)
      : multi.message_body;
    while (payload.length > 0) {
      const size = new DataView(
        payload.buffer,
        payload.byteOffset,
        4,
      ).getUint32(0, true);
      this.#receive(payload.subarray(4, 4 + size));
      payload = payload.subarray(4 + size);
    }
  }

  #closed(reason: string) {
    if (this.#isClosed) return;
    this.#isClosed = true;
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    for (const job of this.#jobs.values()) {
      clearTimeout(job.timer);
      job.reject(new Error(`Steam connection closed: ${reason}`));
    }
    this.#jobs.clear();
    this.emit('close', { reason });
  }
}
